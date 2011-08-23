var uuid = require('node-uuid');

exports.create = function(hub, cost) {
    var self = {};
    self.calls = {};
    self.casts = {};
    var returns = {};
    var call_timeouts = {};

    var receive = function(msg, from, send) {
        switch (msg.type) {
            case 'call':
                if (msg.name in self.calls) {
                    var return_to = msg.from != null ? msg.from : from;
                    
                    var callback = function() {
                        send(return_to, {
                            type: 'return',
                            serial: msg.serial,
                            args: [].slice.call(arguments)
                        });
                    };
                    
                    var forward = function(to, name) {
                        send(to, {
                            type: 'call',
                            name: name,
                            serial:msg.serial,
                            args: [].slice.call(arguments, 2),
                            from: return_to
                        });
                    };
                    
                    self.calls[msg.name].apply(null, [return_to, callback, forward].concat(msg.args));
                }
                break;
            case 'return':
                if (msg.serial in returns) {
                    returns[msg.serial].apply(null, [from].concat([].slice.call(msg.args)));
                    delete returns[msg.serial];
                }
                break;
            case 'cast':
                if (msg.name in self.casts) {
                    self.casts[msg.name].apply(null, [from].concat([].slice.call(msg.args)));
                }
                break;
        }
    };
    
    self.callRetry = function(timeout, to, name) {
        var callback = [].slice.call(arguments, -1)[0];
        var args = [].slice.call(arguments, 0, -1);
        var retry = function () {
            self.call.apply(this, args.concat(function(from) {
                if (from == undefined) {
                    retry();
                } else {
                    callback.apply(null, arguments);
                }
            }));
        };
        retry();
    };
    
    self.call = function(timeout, to, name) {
        var serial = uuid();
        var callback = [].slice.call(arguments, -1)[0];
        returns[serial] = callback;
        
        call_timeouts[serial] = setTimeout(function() {
            if (serial in returns) {
                returns[serial]();
                delete returns[serial];
                delete call_timeouts[serial];
            }
        }, timeout);
        
        router.send(to, {
            type: 'call',
            name: name,
            serial: serial,
            args: [].slice.call(arguments, 3, -1)
        });
    };
    
    self.cast = function(to, name) {
        router.send(to, {
            type: 'cast',
            name: name,
            args: [].slice.call(arguments, 2)
        });
    };
    
    var router = hub.createLocal(receive, cost);
    
    self.getId = router.getId;
    
    self.close = function() {
        router.close();
        for (var serial in call_timeouts) {
            clearTimeout(call_timeouts[serial]);
            delete call_timeouts[serial];
        }
    };
    
    self.addService = router.addService;
    
    self.removeService = router.removeService;

    return self;
};
