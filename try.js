
var ssh2sync = require('./index.js');


var root_local = process.env["HOME"] + "/boilerplate/reikijobsboard.com/out";
var root_remote = "/home/reikiman/test-reikijobsboard.com";
var force = true;

ssh2sync.upload(root_local, root_remote, force, {
      
    //    debug: console.log,
      host: 'rules4humans.com',
      //host: 'mainmini.local',
      port: 22,
      username: 'reikiman',
      //username: 'david',
      privateKey: require('fs').readFileSync('/Users/davidherron/.ssh/id_dsa')
      /*
      host: '192.168.100.100',
      port: 22,
      username: 'frylock',
      password: 'nodejsrules'
      */
    });