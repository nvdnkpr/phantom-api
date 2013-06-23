var TotalRecall = function(storage_type) {
    var _local = (storage_type === 'persistent');

    var lootbag = {};
    this.put = function(key, val) {
        if (_local) {
            localStorage.setItem(key, JSON.stringify(val));
        } else {
            lootbag[key] = val;
        }
    };

    // If key does not exist:
    //   if 2nd arg is passed, i.e., default is defined, return default
    //   if 2nd arg is not passed, return null
    this.get = function(key, default_value) {
        if (_local) {
            if (key in localStorage) {
                return $.parseJSON(localStorage.getItem(key));
            } else {
                return (typeof(default_value) === 'undefined') ? null : default_value;
            }
        } else {
            if (key in lootbag) {
                return lootbag[key];
            } else {
                return (typeof(default_value) === 'undefined') ? null : default_value;
            }
        }
    };

    this.keyExists = function(key) {
        if (_local) {
            return key in localStorage;
        } else {
            return key in lootbag;
        }
    };
    
    this.removeKey = function(key) {
        if (_local) {
            if (key in localStorage) {
                localStorage.removeItem(key);
            }
        } else {
            if (key in lootbag) {
                delete lootbag[key];
            }
        }
    };

    this.clear = function() {
        if (_local) {
            localStorage.clear();
        } else {
            lootbag = {};    
        }
    };

    // FIXME: make work for localStorage
    this.keys = function() {
        return Object.keys(lootbag);
    };
};
module.exports = TotalRecall;
