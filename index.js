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
    
    let relPath = path.relative(modelsPath, rc['config'])
    
    if(!relPath.startsWith('.')) relPath = './' + relPath
    
    lib.db.writeModelsIndex(modelsPath, {
        dbobjectPath: 'bkendz',
        configPath: relPath
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
        this.administerEnabled = this._administer = args.administerEnabled
        this.apiEnabled = args.apiEnabled
        this.optsAdmin = args.optsAdmin || {}
        
        this._sessAdmin = null
        this._sessClient = null
        this._sessApi = null
        this._listening = false
        this.apiSheet = args.apiSheet || {}
    }
    
    set apiSheet(as) {
        this._apiSheet = as || {}
    }
    
    get apiSheet() {
        return this._apiSheet
    }
    
    get adminWs() {
        if (this._adminWs) return this._adminWs.ws
        this._adminWs = this.admin.makeServers()
        return this._adminWs.ws
    }
    
    get adminHttp() {
        if (this._adminWs) return this._adminWs.http
        this.adminWs // init
        return this._adminWs.http
    }
    
    get apiWs() {
        if (this._apiWs) return this._apiWs.ws
        this._apiWs = this.api.makeServers()
        return this._apiWs.ws
    }
    
    get apiHttp() {
        if (this._apiWs) return this._apiWs.http
        this.apiWs // init
        return this._apiWs.http
    }
    
    get admin() {
        if (!this._sessAdmin) this._sessAdmin = new AdministerSession(this.optsAdmin)
        return this._sessAdmin
    }
    
    get client() {
        if (!this._sessClient) this._sessClient = new SessionHandler()
        return this._sessClient
    }
    
    get api() {
        if (!this._sessApi) this._sessApi = new CrudSession({apiSheet: this.apiSheet})
        return this._sessApi
    }
    
    listen(port) {
        if(this.administerEnabled) {
            console.log(`[admin] listening on port ${port}`)
            this.adminHttp.server.listen(port)
            port++
        }
        
        if(this.apiEnabled){
            this.api.models.sequelize.sync()
                .then(() => {
                    console.log(`[api] listening on port ${port}`)
                    this.apiHttp.server.listen(port)
                })
        }
        
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