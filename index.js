/**
 * Created by anthony on 18/03/2018.
 */

const tasks = require('./tasks')
const fs = require('fs'), path = require('path'), lib = require('./lib')

function modelsSync() {
    console.log(`cwd: ${process.cwd()}, dir: ${__dirname}, file: ${__filename}`)
    let rc = lib.utils.getRcConf()
    console.log('[.bkendzrc] %j', rc)
    
    lib.utils.mkDirs(rc['migrations-path'])
    lib.utils.mkDirs(rc['seeders-path'])
    
    let modelsPath = rc['models-path']
    lib.utils.mkDirs(modelsPath)
    
    lib.db.writeModelsIndex(modelsPath, {
        dbobjectPath: 'bkendz',
        configPath: rc['config']
    })
}

const DEFAULT_CONFIG = {}

class SessionHandler extends require('events').EventEmitter {

}

class Bkendz{
    get admin(){
        return require('./server').app
    }
    
    get adminServer(){
        return require('./server').server
    }
}

module.exports = {
    tasks,
    modelsSync,
    Bkendz,
    db: lib.db,
    sequelize: require('sequelize'),
    DbObject: lib.db.DbObject,
    SessionHandler
}