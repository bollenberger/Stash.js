var router = require('./router');
var service = require('./service');
var assert = require('assert');

var hub = router.create();
var hub2 = router.create();
hub2.connectToLocal(hub);

var test_service = service.create(hub, 'test_service', 1);
var test_service_2 = service.create(hub, 'test_service', 2);
var client = service.create(hub2);

var sum = function(from, callback, forward, n, acc) {
    if (acc == undefined) {
        acc = 0;
    }
    if (n == undefined) {
        //n = 0;
    }
    
    if (n <= 0) {
        callback(acc);
    } else {
        if (n % 2) { // ping pong request between nodes.
            forward(test_service.getId(), 'sum', n - 1, acc + n);
        } else {
            forward(test_service_2.getId(), 'sum', n - 1, acc + n);
        }
    }
};

test_service.calls.sum = sum;
test_service_2.calls.sum = sum;

var tests_done = 0;

setTimeout(function() {
    // After the network has had a chance to get set up.
    
    var got_response = false;
    client.call(500, 'test_service', 'sum', 4, function(from, result) {
        if (from == null) {
            // timeout
        } else {
            got_response = true;
            assert.equal(result, 10);
        }
    });
    setTimeout(function() {
        assert.ok(got_response);
        console.log('1');
        ++tests_done;
    }, 600);
    
    client.call(1000, 'test_service', 'summ', function(from, result) {
        assert.equal(from, undefined);
        console.log('2');
        ++tests_done;
    });
}, 100);

var close = function() {
    if (tests_done >= 2) {
        hub.close();
        hub2.close();
        test_service.close();
        test_service_2.close();
        client.close();
    } else {
        setTimeout(close, 500);
    }
};
close();
