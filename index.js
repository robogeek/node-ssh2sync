
var filewalker = require('filewalker');
var Connection = require('ssh2');
var util = require('util');
var async = require('async');
var fs    = require('fs');

var Connection = require('ssh2');


var root_local = process.env["HOME"] + "/boilerplate/reikijobsboard.com/out";
var root_remote = "/home/reikiman/test-reikijobsboard.com";
var force = false;

var c = new Connection();
c.on('connect', function() {
    util.log('Connection :: connect');
});
c.on('ready', function() {
    util.log('Connection :: ready');
    c.sftp(function(err, sftp) {
        if (err) throw err;
        sftp.on('end', function() {
            util.log('SFTP :: SFTP session closed');
        });
        doit(root_local, root_remote, sftp, "", function(err) {
            if (err) throw err;
            util.log('SFTP :: Handle closed');
            sftp.end();
        });
    });
});
c.on('error', function(err) {
    util.log('Connection :: error :: ' + err);
});
c.on('end', function() {
    util.log('Connection :: end');
});
c.on('close', function(had_error) {
    util.log('Connection :: close');
});
c.connect({
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


var doit = function(root_local, root_remote, sftp, dir, done) {
    
    var localdir = root_local +'/'+ dir;
    var statzdir = fs.statSync(localdir);
    if (! statzdir.isDirectory()) {
        throw "NOT A DIRECTORY " + localdir;
    } else {
        var filez = fs.readdirSync(localdir);
        async.forEachSeries(filez,
            function(file, cb) {
                var thepath = (dir !== "") ? (dir+'/'+file) : file;
                var localfile = root_local +'/'+ thepath;
                util.log('TEST ' + localfile);
                var statz = fs.statSync(localfile);
                // util.log(util.inspect(statz));
                if (statz.isDirectory()) {
                    /*use sftp to verify the remote directory exists
                    if not, make the remote directory
                    once satisfied either way, */
                    
                    var remotedir = root_remote +'/'+ thepath;
                    util.log('DIR PATH ' + thepath +' REMOTE DIR '+ remotedir);
                    sftp.stat(remotedir, function(err, attrs) {
                        if (err) {
                            // Most likely the error is remote directory not existing
                            // TBD create attributes object
                            util.log('CREATING REMOTE DIR ' + remotedir);
                            sftp.mkdir(remotedir, {
                                ctime: statz.ctime,
                                atime: statz.atime,
                                mtime: statz.mtime
                            }, function(err) {
                                if (err) {
                                    util.log('ERROR MAKING REMOTE DIR ' + remotedir + ' '+ err);
                                    cb(err);
                                } else {
                                    util.log('MADE REMOTE DIR ' + remotedir);
                                    sftp.setstat(remotedir, {
                                        ctime: statz.ctime,
                                        atime: statz.atime,
                                        mtime: statz.mtime
                                    }, function(err) {
                                        doit(root_local, root_remote, sftp, thepath, function(err) {
                                            if (err) cb(err); else cb();
                                        });
                                    });
                                }
                            });
                        } else {
                            util.log('REMOTE DIR ' + remotedir +' '+ util.inspect(attrs));
                            doit(root_local, root_remote, sftp, thepath, function(err) {
                                if (err) cb(err); else cb();
                            });
                        }
                    });
                } else {
                    /*use sftp to verify the remote file exists
                    if not, upload
                    if it does, and if local differs from remote, upload*/
                    
                    util.log('FILE PATH ' + thepath);
                    var remotefile  = root_remote +'/'+ thepath;
                    util.log('REMOTE FILE ' + remotefile);
                    var closehandle = function(handle, remotefile, statz, cb) {
                        sftp.close(handle, function(err) {
                            if (err) {
                                cb(err);
                            } else {
                                sftp.setstat(remotefile, {
                                    ctime: statz.ctime,
                                    atime: statz.atime,
                                    mtime: statz.mtime
                                }, function(err) {
                                    if (err) cb(err); else cb();
                                });
                            }
                        });
                    }
                    var doupload = function(remotefile, localfile, statz, cb) {
                        sftp.open(remotefile, "w", {
                            ctime: statz.ctime,
                            atime: statz.atime,
                            mtime: statz.mtime
                        }, function(err, handle) {
                            if (err) {
                                cb(err);
                            } else {
                                fs.readFile(localfile, function(err, data) {
                                    if (err) {
                                        cb(err);
                                    } else {
                                        if (data.length === 0) {
                                            closehandle(handle, remotefile, statz, cb);
                                        } else {
                                            sftp.write(handle, data, 0, data.length, 0, function(err) {
                                                if (err) {
                                                    cb(err);
                                                } else {
                                                    closehandle(handle, remotefile, statz, cb);
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    }
                    sftp.stat(remotefile, function(err, attrs) {
                        if (err) {
                            // Most likely the error is that the remote file does not exist
                            doupload(remotefile, localfile, statz, cb);
                        } else {
                            util.log('REMOTE FILE ' + remotefile +' '+ util.inspect(attrs));
                            if (force) doupload(remotefile, localfile, statz, cb);
                            cb();
                        }
                    });
                }
            },
            function(err) {
                if (err) {
                    util.log('ERR ' + err);
                    done(err);
                } else
                    done();
            });
    }
}