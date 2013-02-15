
var filewalker = require('filewalker');
var Connection = require('ssh2');
var util = require('util');
var async = require('async');
var fs    = require('fs');
var path  = require('path');



module.exports.upload = function(root_local, root_remote, force, ssh2opts) {
    
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
            doit(root_local, root_remote, "", "", force, sftp, function(err) {
                if (err) throw err;
                util.log('SFTP :: Handle closed');
                sftp.end();
                c.end();
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
    c.connect(ssh2opts);
}


var mkdir = function(sftp, dir, attrs, cb) {
    sftp.mkdir(dir, attrs, function(err) {
        if (err) {
            // util.log('ERROR MAKING REMOTE DIR ' + remotedir + ' '+ err);
            cb(err);
        } else {
            util.log('mkdir ' + remotedir);
            sftp.setstat(remotedir, attrs, function(err) {
                if (err) cb(err); else cb();
            });
        }
    });
}

var closehandle = function(sftp, handle, remotefile, statz, cb) {
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

var doupload = function(sftp, remotefile, localfile, statz, cb) {
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
                        closehandle(sftp, handle, remotefile, statz, cb);
                    } else {
                        sftp.write(handle, data, 0, data.length, 0, function(err) {
                            if (err) {
                                cb(err);
                            } else {
                                closehandle(sftp, handle, remotefile, statz, cb);
                            }
                        });
                    }
                }
            });
        }
    });
}

var doit = function(root_local, root_remote, path_local, path_remote, force, sftp, done) {
    
    var localdir = path.join(root_local, path_local);
    // util.log(localdir);
    var statzdir = fs.statSync(localdir);
    if (! statzdir.isDirectory()) {
        throw "NOT A DIRECTORY " + localdir;
    } else {
        var filez = fs.readdirSync(localdir);
        async.forEachSeries(filez,
            function(file, cb) {
                var localfile = path.normalize(path.join(localdir, file));
                // util.log('TEST ' + localfile +' PATH '+ path_local +' REMOTE '+ path_remote +' FILE '+ file);
                var statz = fs.statSync(localfile);
                // util.log(util.inspect(statz));
                if (statz.isDirectory()) {
                    /*use sftp to verify the remote directory exists
                    if not, make the remote directory
                    once satisfied either way, */
                    
                    var remotedir  = root_remote +'/'+ ((path_remote !== "") ? (path_remote+'/'+file) : file);
                    // util.log('DIR PATH ' + path_local +' REMOTE DIR '+ remotedir);
                    sftp.stat(remotedir, function(err, attrs) {
                        if (err) {
                            // Most likely the error is remote directory not existing
                            // util.log('CREATING REMOTE DIR ' + remotedir);
                            mkdir(sftb, remotedir, {
                                ctime: statz.ctime,
                                atime: statz.atime,
                                mtime: statz.mtime
                            },
                            function(err) {
                                doit(root_local, root_remote,
                                     path.join(path_local, file),
                                     path_remote +'/'+ file,
                                     force, sftp, function(err) {
                                    if (err) cb(err); else cb();
                                });
                            });
                        } else {
                            // util.log('REMOTE DIR ' + remotedir +' '+ util.inspect(attrs));
                            doit(root_local, root_remote,
                                path.join(path_local, file),
                                path_remote +'/'+ file,
                                force, sftp, function(err) {
                                if (err) cb(err); else cb();
                            });
                        }
                    });
                } else {
                    /*use sftp to verify the remote file exists
                    if not, upload
                    if it does, and if local differs from remote, upload*/
                    
                    // util.log('FILE PATH ' + localfile);
                    var remotefile  = root_remote
                            + (path_remote !== "" ? (path_remote +'/') : "/")
                            + file;
                    // util.log('root_remote '+ root_remote +' path_remote '+ path_remote +' file '+ file);
                    util.log('upload to ' + remotefile);
                    sftp.stat(remotefile, function(err, attrs) {
                        if (err) {
                            // Most likely the error is that the remote file does not exist
                            doupload(sftp, remotefile, localfile, statz, cb);
                        } else {
                            // util.log('REMOTE FILE ' + remotefile); // +' '+ util.inspect(attrs));
                            if (force) doupload(sftp, remotefile, localfile, statz, cb);
                            else cb();
                        }
                    });
                }
            },
            function(err) {
                if (err) {
                    util.log('ERR ' + err);
                    done(err);
                } else {
                    var localfiles = fs.readdirSync(localdir);
                    var checkdir = function(sftp, handle, done) {
                        sftp.readdir(handle, function(err, list) {
                            if (err) done(err);
                            else if (!list) done();
                            else {
                                list.forEach(function(entry) {
                                    var existlocal = false;
                                    localfiles.forEach(function(fn) {
                                        if (fn === entry.filename) existlocal = true;
                                    });
                                    if (!existlocal && entry.filename !== "." && entry.filename !== "..") {
                                        util.log('rm '+ remotedir+'/'+ entry.filename);
                                        sftp.unlink(remotedir+'/'+ entry.filename, function(err) {
                                            if (err) util.log('FAILED to unlink '+ remotedir+'/'+ entry.filename
                                                    +' BECAUSE '+ err);
                                        });
                                    }
                                });
                                checkdir(sftp, handle, done);
                            }
                        });
                    };
                    var remotedir  = root_remote +'/'+ path_remote;
                    sftp.opendir(remotedir, function(err, handle) {
                        if (err) done(err);
                        else checkdir(sftp, handle, done);
                    });
                }
            });
    }
}