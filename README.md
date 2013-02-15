
This is meant to be a first step towards implementing rsync purely in Node.  That's a large task, so the first step is to implement the part I actually need.  Namely:

```
rsync --archive --delete localdir user@server:remotedir
```

Usage:

```
var ssh2sync = require('ssh2sync');

var root_local = ... ; // Grab these from command line arguments?
var root_remote = ...;
var force = true;

ssh2sync.upload(root_local, root_remote, force, {
      
    //    debug: console.log,
    host: ... remote host name ...,
    port: 22,
    username: ... user name ...,
    privateKey: require('fs').readFileSync('/path/to/users/.ssh/id_dsa')
    // OR password: ... the password ..
});
```