var inRange = function(key, low, high) {
        return (low < high && key > low && key < high) || (low > high && (key > low || key < high)) || (low == high);
    };
    
    var addExp = function(key, exponent) {
        // key + 2 ^ exponent - assumes hashes are hex strings
        var sum = key.split('');
        var carry = 0;
        for (var i = key.length - 1; i >= 0 ; --i) {
            if (Math.floor(exponent / 4) == key.length - i - 1) {
                carry += Math.pow(2, exponent % 4)
            }
            console.log('carry[' + i + ']=' + carry);
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
    
console.log(addExp('abc', 2));
