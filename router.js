var dgram = require('dgram');
var uuid = require('node-uuid');

var memoize = function(f) {
    var memo = {};
    return function() {
        var key = [].slice.call(arguments);
        return (key in memo) ? memo[key] : memo[key] = f.apply(this, arguments);
    }
};

var nextUuid = 0;
var uuid = function() {
    return ++nextUuid;
};

var machine_id = uuid();

exports.create = function(on_message, port, address, region, node_id, my_machine_id) {
    var self = {};
    
    var debugLevelNum = 0;
    self.debugLevel = function(level) {
        debugLevelNum = level;
    };
    var debug = function() {
        if (debugLevelNum >= 1) {
            console.log.apply(this, arguments);
        }
    };
    
    if (!(region instanceof Array)) {
        region = [region];
    }
    if (my_machine_id == null) {
        my_machine_id = machine_id;
    }
    if (node_id == null) {
        node_id = uuid();
    }
    var id = region.concat([my_machine_id, node_id]);
    
    var proxies = {};
    var peers = {};
    var routes = {};
    
    var networkPrefix = function(address) {
        var prefix = null;
        if (address instanceof Array) {
            // Find the distinct region to forward to.
            // If we're in the same region, we need to send to the
            // fully qualified address.
            for (var i = 0; i < address.length && i < id.length; ++i) {
                if (address[i] != id[i]) {
                    prefix = address.slice(0, i + 1);
                    break;
                }
            }
        } else {
            prefix = address;
        }
        return prefix;
    }
    
    var forward = function(msg) {
        if (msg.ttl <= 0) {
            return;
        }
        
        var destination = networkPrefix(msg.to);
        
        if (destination in routes) {
            --msg.ttl;
            routes[destination][0].proxy(msg);
        }
    };
    
    var connectToProxy = function(proxy, cost) {
        cost = cost || 1;
        proxy({type: 'connect', id: id, cost: cost}, proxy.me);
    };
    
    self.dumpRoutes = function() {
        console.log("\nRouting table for " + id);
        for (var to in routes) {
            for (var i in [0]) {
                var route = routes[to][i];
                console.log(to + " via " + route.proxy.id + " cost " + route.cost);
            }
        }
        for (var i in peers) {
            var peer = peers[i];
            console.log(peer.id + " ttl " + peer.ttl);
        }
        console.log('');
    }
    
    var advertiseAllRoutes = function(peer) {
        for (var to in routes) {
            var route = routes[to][0];
            if (route.proxy != peer) {
                peer({
                    type: 'route',
                    to: route.proxy.id,
                    cost: route.cost + peer.cost
                }, peer.me);
            }
        }
    };
    
    var advertiseRoute = function(to, cost, except_peer) {
        for (var i in peers) {
            var peer = peers[i];
            if (peer != except_peer && to.toString() != peer.id.toString()) {
                peer({
                    type: 'route',
                    to: to,
                    cost: cost == null ? cost : cost + peer.cost
                }, peer.me);
            }
        }
    };
    
    var addRoute = function(to, proxy, cost) {
        if (cost != null) {
            cost = (cost >= 1) ? cost : 1; // Clamp cost to a minimum of 1 (or null for infinity)
        }
        
        to = networkPrefix(to);
        if (to == null) {
            return; // Don't add routes to our own local network or host.
        }
        
        var old_cost = to in routes ? routes[to][0].cost : null;
        
        if (cost == null) {
            if (to in routes) {
                for (var i in routes[to]) {
                    if (routes[to][i].proxy == proxy) {
                        routes[to].splice(i, 1);
                        break;
                    }
                }
                if (routes[to].length == 0) {
                    delete routes[to];
                }
            }
        } else {
            if (!(to in routes)) {
                routes[to] = [];
            }
            
            // Insert in cost position
            var i;
            for (i = 0; i < routes[to].length; ++i) {
                if (routes[to][i].proxy.id == proxy.id) {
                    routes[to].splice(i, 1);
                }
            }
            for (i = 0; i < routes[to].length; ++i) {
                if (routes[to][i].cost > cost) {
                    break;
                }
            }
            routes[to].splice(i, 0, {
                to: to,
                proxy: proxy,
                cost: cost
            });
        }
        
        var new_cost = to in routes ? routes[to][0].cost : null;
        if (old_cost != new_cost) {
            advertiseRoute(to, new_cost, proxy);
        }
    };
    
    var removeRoutesTo = function(to) {
        if (to in routes) {
            delete routes[to];
            for (var i in peers) {
                var peer = peers[i];
                advertiseRoute(to, null, peer);
            }
        }
    };
    
    var removeRoutesVia = function(via) {
        debug(id + ' removing routes via ' + via.id);
        for (var to in routes) {
            addRoute(routes[to][0].to, via, null);
        }
    };
    
    var readvertise = function() {
        for (var to in peers) {
            advertiseAllRoutes(peers[to]);
        }
        setTimeout(readvertise, 60000);
    };
    readvertise();

    var receive = function(msg, from) {
        //debug(id + ' received ' + JSON.stringify(msg));
        switch (msg.type) {
            case 'connect':
                var was_in_peers = msg.id in peers;
                var was_in_proxies = msg.id in proxies;
                
                from.id = msg.id;
                from.ttl = 3;
                from.cost = msg.cost;
                from.me = self.getProxy();
                
                peers[msg.id] = from;
                proxies[msg.id] = from;
                
                addRoute(msg.id, from, msg.cost);
                
                if (!was_in_peers) {
                    advertiseAllRoutes(from);
                }
                if (!was_in_proxies) {
                    var reconnect = function() {
                        var proxy = proxies[msg.id];
                        debug(id + ' decrements ' + msg.id + ' ttl from ' + proxy.ttl);
                        if ((--proxy.ttl) == 0) {
                            delete peers[msg.id];
                            removeRoutesVia(proxy);
                        }
                        connectToProxy(proxy, proxy.cost);
                        setTimeout(reconnect, 2000);
                    };
                    reconnect();
                }
                break;
            case 'route':
                //console.log(id + ' heard that it can route to ' + JSON.stringify(msg.to) + ' via ' + JSON.stringify(from.id) + ' with cost ' + msg.cost);
                addRoute(msg.to, from, msg.cost);
                break;
            case 'message':
                if (msg.to.toString() == id.toString()) {
                    on_message(msg.msg, msg.from, self.sendTo);
                } else {
                    forward(msg);
                }
                break;
        }
    };
    
    self.createLocal = function(on_message, cost) {
        var subnode = exports.create(on_message, null, null, id.slice(0, -2), null, id.slice(-2, -1)[0]);
        subnode.connectToLocal(self, cost);
        return subnode;
    };
    
    var services = {};
    self.registerService = function(service_name, on_message) {
        var service_proxy = function(msg, from) {
            switch (msg.type) {
                case 'message':
                    if (msg.to == service_name) {
                        on_message(msg.msg, msg.from, self.sendTo);
                    }
                    break;
            }
        };
        service_proxy.id = service_name;
        services[service_name] = service_proxy;
        addRoute(service_name, service_proxy, 1);
    };
    
    self.unregisterService = function(service_name) {
        addRoute(service_name, services[service_name], null);
        delete services[service_name];
    };
    
    self.sendTo = function(msg, to, ttl) {
        ttl = ttl || 32;
        receive({
            type: 'message',
            from: id,
            to: to,
            msg: msg,
            ttl: ttl
        });
    };
    
    self.getProxy = function() {
        return function () {
            var args = arguments;
            setTimeout(function() {
                receive.apply(this, args)
            }, 0);
        }
    };
    
    var socket;
    var createProxy = memoize(function(port, address) {
        return function(msg) {
            if (socket) {
                var msg_str = JSON.stringify(msg);
                socket.send(new Buffer(msg_str), 0, msg_str.length, port, address);
            }
        };
    });
    
    var listen = function(listen_port, listen_address) {
        if (listen_port && listen_address) {
            port = listen_port;
            address = listen_address;
        }
    
        socket = dgram.createSocket('udp4');
    
        socket.on('message', function(msg_str, rinfo) {
            var msg = JSON.parse(msg_str);
            receive(msg, createProxy(rinfo.port, rinfo.address));
        });
        socket.bind(port, address);
        
        self.connectTo = function(port, address, cost) {
            connectToProxy(createProxy(port, address), cost);
        };
        
        self.close = function() {
            socket.close();
            socket = null;
            delete self.close;
            delete self.connectTo;
            self.listen = listen;
        };
        
        delete self.listen;
    };
    if (port && address) {
        listen();
    } else {
        self.listen = listen;
    }
    
    self.getId = function() {
        return id;
    };

    self.connectToLocal = function(router, cost) {
        var proxy = router.getProxy();
        proxy.me = self.getProxy();
        connectToProxy(proxy, cost);
    };
    
    return self;
};

exports.createLocal = function(on_message) {
    return exports.create(undefined, undefined, on_message);
};
