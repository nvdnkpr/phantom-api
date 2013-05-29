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

// Instantiate Phantom Server object
var phantom = require('../phantom_server');

// start Phantom Server
phantom.start(conf, MyApp);
