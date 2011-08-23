var servicelib = require('./service');
var hashlib = require('hashlib');

var contains = function(array, element) {
    for (var i in array) {
        if (array[i] == element) {
            return true;
        }
    }
    return false;
};

var hash = function(x) {
    return hashlib.sha256(x).slice(0,4);
};
//var hash = hashlib.sha256;

var create = function(hub, service_id, name, should_not_connect, service_keepalive) {
    var service = servicelib.create(hub);
    
    var id = service.getId();
    var n = hash(id);
    
    var pred = null;
    var succ = null;
    var alternates = [];
    var pred_ttl = null;
    var succ_ttl = null;
    var fingers = [];
    
    var debug = function() {
        console.log(pred + '(' + hash(pred) + ")\t<- " + id + '(' + n + ')\t-> \t' + succ + '(' + hash(succ) + ') ' + JSON.stringify(alternates));
        setTimeout(debug, 2000);
    };
    //debug();

    
    var self = {};
    
    var inRange = function(key, low, high) {
        return (low < high && key > low && key < high) || (low > high && (key > low || key < high)) || (low == high && key != low);
    };
    
    var inHalfOpenRange = function(key, low, high) {
        return (low < high && key > low && key <= high) || (low > high && (key > low || key <= high)) || (low == high);
    };
    
    var addExp = function(key, exponent) {
        // key + 2 ^ exponent - assumes hashes are hex strings
        var sum = key.split('');
        var carry = 0;
        for (var i = key.length - 1; i >=0 ; --i) {
            if (Math.floor(exponent / 4) == key.length - i - 1) {
                carry += Math.pow(2, exponent % 4)
            }
            if (carry > 0) {
                sum[i]
                var digit = parseInt(sum[i], 16) + carry;
                carry = 0;
                while (digit >= 16) {
                    ++carry;
                    digit -= 16;
                }
                sum.splice(i, 1, digit.toString(16));
            }
        }
        return sum.join('');
    };
    
    var closest_preceding_node = function(key) {
        for (var i = fingers.length - 1; i >= 0; --i) {
            if (inRange(hash(fingers[i]), n, key)) {
                return fingers[i];
            }
        }
        return id;
    };
    
    service.calls.findSuccessor = function(from, callback, forward, key) {
        if (inHalfOpenRange(key, n, hash(succ))) {
            callback(succ);
        } else {
            forward(closest_preceding_node(key), 'findSuccessor', key);
        }
    };
    
    service.calls.getServiceId = function(from, callback, forward) {
        callback(service_id);
    };
    
    service.calls.getPredecessor = function(from, callback, forward, n, collection) {
        callback(pred);
    };
    
    service.casts.notify = function(from) {
        if (pred == null || inRange(hash(from), hash(pred), n)) {
            pred = from;
        }
        if (hash(from) == hash(pred)) {
            pred_ttl = 6; // reset ttl
        }
    };
    
    service.casts.keepAlive = function(from) {
        if (hash(from) == hash(succ)) {
            succ_ttl = 6; // reset ttl
        }
    };
    
    var keep_alive_timeout;
    var keep_alive = function() {
        if (pred) {
            service.cast(pred, 'keepAlive');
        }
        keep_alive_timeout = setTimeout(keep_alive, 500);
    };
    
    var stabilize_timeout;
    var stabilize = function() {
        service.call(5000, succ, 'getPredecessor', function(from, succ_pred) {
            if (from == undefined) {
                stabilize(); // Retry
            } else {
                if (succ_pred != null && inRange(hash(succ_pred), n, hash(succ))) {
                    succ = succ_pred;
                }
                service.cast(succ, 'notify');
                
                stabilize_timeout = setTimeout(stabilize, 500);
            }
        });
    };
    
    var fix_fingers_timeout;
    var next_finger = 0;
    var fix_fingers = function() {
        var key = addExp(n, next_finger);
        service.call(5000, closest_preceding_node(key), 'findSuccessor', key, function(from, finger) {
            if (from != undefined) {
                fingers[next_finger] = finger;

                ++next_finger;
                if (hash(finger) == n) {
                    fingers.length = next_finger;
                    next_finger = 0;
                }
            }
            
            fix_fingers_timeout = setTimeout(fix_fingers, 1000);
        });
    };
    
    var fix_alternates_timeout;
    var next_alternate = 0;
    var fix_alternates = function() {
        if (alternates.length > fingers.length) {
            alternates.length = fingers.length; // Fingers provides a good estimate of the number of alternates we need.
        }
        if (next_alternate >= fingers.length) {
            next_alternate = 0;
        }
        
        if (next_alternate == 0) {
            alternates[next_alternate] = succ;
            ++next_alternate;
            fix_alternates_timeout = setTimeout(fix_alternates, 1500);
        } else {
            service.call(5000, alternates[next_alternate - 1], 'findSuccessor', addExp(hash(alternates[next_alternate - 1]), 0), function (from, alternate) {
                if (from == undefined) {
                    fix_alternates(); // Retry
                } else {
                    if (hash(alternate) == n) {
                        alternates.length = next_alternate;
                        next_alternate = 0;
                    } else {
                        alternates[next_alternate] = alternate;
                        ++next_alternate;
                    }
                    fix_alternates_timeout = setTimeout(fix_alternates, 1500);
                }
            });
        }
    };
    
    var check_timeout;
    var next_alternate_succ = 0;
    var check = function() {
        if (pred_ttl != null && --pred_ttl == 0) {
            pred = null;
            pred_ttl = null;
        }
        if (succ_ttl != null && --succ_ttl == 0) {
            if (next_alternate_succ >= alternates.length) {
                next_alternate_succ = 0;
            }
            if (hash(succ) == hash(alternates[next_alternate_succ])) {
                ++next_alternate_succ;
            }
            if (next_alternate_succ < alternates.length) {
                succ = alternates[next_alternate_succ++];
                succ_ttl = 6;
            }
        }
        
        check_timeout = setTimeout(check, 1000);
    };
    
    var isOwner = function(value) {
        return pred == null || inHalfOpenRange(hash(value), pred, n);
    };
    
    var service_keepalive_timeout;
    var service_keepalive_job = function() {
        service_keepalive(isOwner);
        setTimeout(service_keepalive_job, 5000);
    };
    
    var start = function() {
        service.addService(name);
        stabilize();
        keep_alive();
        fix_fingers();
        fix_alternates();
        check();
        if (service_keepalive) {
            service_keepalive_job();
        }
    };
    
    if (should_not_connect) {
        succ = id;
        start();
    } else {
        service.callRetry(3000, name, 'findSuccessor', n, function(from, result) {
            succ = result;
            start();
        });
    }
    
    self.close = function() {
        clearTimeout(stabilize_timeout);
        clearTimeout(keep_alive_timeout);
        clearTimeout(fix_fingers_timeout);
        clearTimeout(fix_alternates_timeout);
        clearTimeout(check_timeout);
        clearTimeout(service_keepalive_timeout);
        service.close();
        debug = function() {};
    };
    
    self.findOwner = function(value, callback) {
        service.callRetry(5000, id, 'findSuccessor', hash(value), function(from, succ) {
            service.call(5000, succ, 'getServiceId', function(from, owner) {
                if (from == undefined) {
                    self.findOwner(value, callback);
                } else {
                    callback(owner);
                }
            });
        });
    };
    
    self.getSuccessor = function() {
        service.call(5000, succ, 'getServiceId', function(from, service_id) {
            if (from == undefined) {
                self.getSuccessor();
            } else {
                callback(service_id);
            }
        }
    };
    
    return self;
};

exports.createFirst = function(hub, id, name, n, on_lost_pred, on_lost_succ) {
    n = n || 1;
    
    var self = create(hub, id, name, true, on_lost_pred, on_lost_succ);
    var node;
    if (n > 1) {
        node = exports.create(hub, id, name, n - 1, on_lost_pred, on_lost_succ);
    }
    
    self._orig_close = self.close;
    self.close = function() {
        self._orig_close();
        if (node) {
            node.close();
        }
    };
    
    return self;
};

exports.create = function(hub, id, name, n, on_lost_pred, on_lost_succ) {
    n = n || 1;

    var nodes = [];
    var node;
    
    for (var i = 0; i < n; ++i) {
        var new_node = create(hub, id, name, false, on_lost_pred, on_lost_succ);
        if (node) {
            nodes.push(new_node);
        } else {
            node = new_node;
        }
    }
    
    node._orig_close = node.close;
    node.close = function() {
        node._orig_close();
        for (var i in nodes) {
            nodes[i].close();
        }
    };
    
    return node;
};

