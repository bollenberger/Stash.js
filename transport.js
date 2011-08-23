var dgram = require('dgram');

function memoize(f) {
    var memo = {};
    return function() {
        var key = [].slice.call(arguments)
        if (key in memo) {
            return memo[key];
        }
        return memo[key] = f.apply(this, arguments);
    }
}

exports.create = function(port, address, on_message) {
    var self = {};

    self.receive = function(msg_str, from) {
        var msg = JSON.parse(msg_str);
        console.log(msg);
        on_message(msg, function(
    };

    var socket = dgram.createSocket('udp4');
    
    var createProxy = memoize(function(port, address) {
        return function(msg, from) {
            // Serialize msg
            var msg_str = JSON.stringify(msg);
            socket.send(msg_str, 0, msg.length, port, address, callback);
        };
    });
    
    socket.on('message', function(msg, rinfo) {
        self.receive(msg, createProxy(rinfo.port, rinfo.address));
    });
    socket.bind(port, address);
    
    var peers = {};
    
    var sendTo = function(msg, destination) {
        //use routes
    };
        
    self.connectTo = function(proxy) {
        proxy("connect from me", this.receive);
    };
    
    self.connectToAddress = function(port, address) {
        this.connectTo(createProxy(port, address));
    };
}
