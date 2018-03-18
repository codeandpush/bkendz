/**
 * Created by anthony on 07/04/2017.
 */
const path = require('path')
const Promise = require('bluebird')
const _ = require('lodash')
const moment = require('moment')
const fs = Promise.promisifyAll(require('fs'))

function mkDirs(filePath) {
    let dirname = filePath
    if (fs.existsSync(dirname)) {
        return true;
    }
    fs.mkdirSync(dirname);
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


module.exports = {normalizePort, serverListenErrorHandler, mkDirs}