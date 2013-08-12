var TotalRecall = function() {

    var _lootBag = {};

    this.put = function( key, val ) {
        _lootBag[key] = val;
    };

    // If key does not exist:
    //   if 2nd arg is passed, i.e., default is defined, return default
    //   if 2nd arg is not passed, return null
    this.get = function( key, default_value ) {
        if ( key in _lootBag ) {
            return _lootBag[key];
        } else {
            return ( typeof(default_value) === "undefined" ) ? null : default_value;
        }
    };

    this.keyExists = function( key ) {
        return key in _lootBag;
    };

    this.removeKey = function( key ) {
        if ( key in _lootBag ) {
            delete _lootBag[key];
        }
    };

    this.clear = function() {
        _lootBag = {};    
    };

    this.keys = function() {
        return Object.keys(_lootBag);
    };
};

module.exports = TotalRecall;
