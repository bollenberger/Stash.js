var router = require('./router');
var dht = require('./dht');

var hub = router.create(null, null, null, null);

var d = dht.createFirst(hub, 'dht', 2, 2);
var d2 = dht.create(hub, 'dht', 3, 2);

setTimeout(function() {
    console.log('here we go');
    d.set('a', 2, function() {
        d.get('a', function(result) {
            console.log(result);
            
            d.close();
            d2.close();
            hub.close();
        });
    });
}, 5000);
