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

var fib = memoize(function(n) {
    if (n == 0 || n == 1) {
        return 1;
    }
    return fib(n-1) + fib(n-2);
});

function make(n) {
    return function () {
        return n;
    };
}

var uuid = require('node-uuid');

for (var i = 0; i < 10; ++i) {
    console.log(uuid());
}
