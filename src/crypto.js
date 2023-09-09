function randomKey(length=32) {
    var choice = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var key = '';
    for (var i = 0; i < length; i++) {
        key += choice.charAt(Math.floor(Math.random() * choice.length));
    }
    return key;
}

module.exports = {
    randomKey: randomKey
};