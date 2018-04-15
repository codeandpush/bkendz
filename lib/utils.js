/**
 * Created by anthony on 07/04/2017.
 */
const path = require('path')
const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const fs = Promise.promisifyAll(require('fs'))

function getRcConf() {
    let rcPath = path.join(process.cwd(), '.bkendzrc')
    if (fs.existsSync(rcPath)) {
        return require(rcPath)
    } else return {
        'config': path.resolve(process.cwd(), 'db.js'),
        'models-path': path.resolve(process.cwd(), 'models'),
        'migrations-path': path.resolve(process.cwd(), 'db', 'migrations'),
        'seeders-path': path.resolve(process.cwd(), 'db', 'seeders'),
    }
}

function mkDirs(filePath) {
    let dirname = filePath
    let parentDir = path.dirname(dirname)
    if (fs.existsSync(dirname)) {
        return true;
    }else if(parentDir && !fs.existsSync(parentDir)){
        return mkDirs(parentDir)
    }
    return fs.mkdirSync(dirname)
}
function normalizePort(val) {
    let port = parseInt(val, 10)
    if (isNaN(port)) return val // named pipe
    return port >= 0 ? port : false
}

function serverListenErrorHandler(error) {
    if (error.syscall !== 'listen') throw error
    let port = normalizePort(error.port)
    let bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port
    
    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges')
            process.exit(1)
            break
        case 'EADDRINUSE':
            console.error(bind + ' is already in use')
            process.exit(1)
            break
        default:
            throw error
    }
}

function deleteFiles(dirPath, fn = null) {
    if(!fs.existsSync(dirPath)) return
    for (let fName of fs.readdirSync(dirPath)) {
        if (!fn || fn(fName)) {
            fs.unlinkSync(path.join(dirPath, fName))
        }
    }
}

function getSuperClasses(cls, untilClsName) {
    let p = Object.getPrototypeOf(cls.prototype)
    if(!p || p.constructor.name === untilClsName){
        return []
    }
    return _.concat([p.constructor], getSuperClasses(p.constructor, untilClsName))
}

function stackPrinter(app) {
    let txt = []
    const util = require('util')
    
    function printItem(item, prefix) {
        prefix = prefix || '';
        
        if (item.route) {
            txt.push(util.format(prefix, 'Route', item.route.path))
        } else if (item.name === '<anonymous>') {
            txt.push(util.format(prefix, item.name, item.handle))
        } else {
            txt.push(util.format(prefix, item.name, item.method ? '(' + item.method.toUpperCase() + ')' : ''))
        }
        
        printSubItems(item, prefix + ' -');
    }
    
    function printSubItems(item, prefix) {
        if (item.name === 'router') {
            txt.push(util.format(prefix, 'MATCH', item.regexp))
            
            if (item.handle.stack) {
                item.handle.stack.forEach(function (subItem) {
                    printItem(subItem, prefix);
                });
            }
        }
        
        if (item.route && item.route.stack) {
            item.route.stack.forEach(function (subItem) {
                printItem(subItem, prefix);
            });
        }
        
        if (item.name === 'mounted_app') {
            txt.push(util.format(prefix, 'MATCH', item.regexp))
        }
    }
    
    app._router.stack.forEach(function(stackItem) {
        printItem(stackItem);
    })
    return txt
}

module.exports = {normalizePort, serverListenErrorHandler, mkDirs, getRcConf, deleteFiles, getSuperClasses, stackPrinter}