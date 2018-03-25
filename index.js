/**
 * Created by anthony on 18/03/2018.
 */

const tasks = require('./tasks')
const fs = require('fs'), path = require('path'), lib = require('./lib'), _ = require('lodash')

function modelsSync(options) {
    options = options || {clean: false, seed: false}
    let clean = options.clean, seed = options.seed
    
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
    
    if (clean) {
        lib.utils.deleteFiles(rc['migrations-path'], (fName) => fName !== '.keep')
        let dbPath = require(rc['config'])[process.env.NODE_ENV].storage
        
        if (!fs.existsSync(dbPath)) return
        fs.unlinkSync(dbPath)
    }
    
    return lib.db.generateMigrations().then(() => lib.db.init(seed))
}

// app.listen(9000)
//
// app.administerEnabled = true
// app.clientEnabled = true
// app.apiEnabled = true
//
// app.session.on('requested', (messageHandler, request) => {
//
//
//     messageHandler.respond({display: 'Hello World'})
// })

const DEFAULT_CONFIG = {}

const {AdministerSession, SessionHandler, CrudSession} = lib.session

class Bkendz {
    
    constructor(args) {
        this._administer = args.administerEnabled
        this._sessAdmin = null
        this._sessClient = null
        this._sessApi = null
        this._listening = false
        this.apiSheet = args.apiSheet || {}
    }
    
    startApi() {
    
    }
    
    set apiSheet(as) {
        this._apiSheet = as || {}
    }
    
    get apiSheet() {
        return this._apiSheet
    }
    
    // get cache() {}
    // get cacheHttp() {}
    // get cacheWs() {}
    
    get adminWs() {
        if (this._adminWs) return {handler: this._adminWs.wsHandler, server: this._adminWs.wsServer}
        
        let {app, server, wsServer} = require('./server').createHttp({'/': this.admin.messageHandlers.http})
        
        wsServer.on('request', this.admin.wsRequestHandler.bind(this.admin))
        
        this._adminWs = {
            wsServer: wsServer,
            httpApp: app,
            httpServer: server,
            wsHandler: this.admin.messageHandlers.ws,
            httpHandler: this.admin.messageHandlers.http
        }
        return {handler: this._adminWs.wsHandler, server: this._adminWs.wsServer}
    }
    
    get adminHttp() {
        if (this._adminWs) return {handler: this._adminWs.httpHandler, server: this._adminWs.httpServer}
        this.adminWs // init
        return {handler: this._adminWs.httpHandler, server: this._adminWs.httpServer}
    }
    
    get admin() {
        if (!this._sessAdmin) this._sessAdmin = new AdministerSession()
        return this._sessAdmin
    }
    
    get client() {
        if (!this._sessClient) this._sessClient = new SessionHandler()
        return this._sessClient
    }
    
    get api() {
        if (!this._sessApi) this._sessApi = new CrudSession()
        return this._sessApi
    }
    
    set administerEnabled(enabled) {
        this._administer = true
        //this.emit('administer_changed', enabled)
    }
    
    listen(port) {
        `listening on port ${port}`
        this.adminHttp.server.listen(port)
        let _adminWs = this.adminWs
        this._listening = true
    }
}

Bkendz.DEFAULT_HANDERS = {}

module.exports = {
    tasks,
    modelsSync,
    Bkendz,
    db: lib.db,
    sequelize: require('sequelize'),
    DbObject: lib.db.DbObject,
    SessionHandler,
    ApiSessionHandler: CrudSession,
}

if (require.main === module) {

}