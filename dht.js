var chordlib = require('./chord');
var servicelib = require('./service');

var create = function(createChord, hub, name, n, r) {
    var store = {};
    var owned = {};
    var service = servicelib.create(hub);
    
    var keepalive = function(isOwner) {
        for (var key in owned) {
            
        }
    };
    
    var chord = createChord(hub, service.getId(), name + '.chord', n, keepalive);
    
    service.calls.get = function(from, callback, forward, key) {
        callback(store[key]);
    };
    
    service.calls.set = function(from, callback, forward, key, value) {
        store[key] = {value;
        callback();
    };
    
    service.casts.replicate = function(from, key, value, n) {
        chord.getSuccessor
    };
    
    service.calls.unset = function(from, callback, forward, key) {
        delete store[key];
        callback();
    };
    
    var self = {};
    
    self.set = function(key, value, callback) {
        chord.findOwners(key, r, function(owners) {
            service.callRetry(5000, owners[1], 'set', key, value, callback);
        });
    };
    
    self.get = function(key, callback) {
        chord.findOwners(key, r, function(owners) {
            service.callRetry(5000, owners[1], 'get', key, function(from, result) {
                callback(result);
            });
        });
    };
    
    self.unset = function(key, callback) {
        chord.findOwners(key, r, function(owners) {
            service.callRetry(5000, owners[1], 'unset', key, callback);
        });
    };
    
    self.close = function() {
        chord.close();
        service.close();
    };
    
    return self;
};

exports.createFirst = function(hub, name, n, r) {
    return create(chordlib.createFirst, hub, name, n, r);
};

exports.create = function(hub, name, n, r) {
    return create(chordlib.create, hub, name, n, r);
};
