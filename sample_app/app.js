var MyApp = new function() {

    var initialize = function() {
        console.log('1. Application initialized');
    };

    this.postFatherOfThor = function() {
        return {name: 'Odin'};
    };

    this.getBrotherOfThor = function() {
        return {name: 'Loki'};
    };

    this.getSisterOfThor = function() {
        return {name: 'Vera'};
    };

    initialize();
};

// get user-defined config
var conf = require('./config').config;

// instantiate phantom object
var phantom = require('phantom');

// start phantom application server
phantom.start(conf, MyApp);
