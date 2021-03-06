/**
 * Created by anthony on 18/03/2018.
 */

const tasks = require('./tasks')
const fs = require('fs'), path = require('path'), lib = require('./lib'), _ = require('lodash')

function modelsSync(options) {
    options = options || {clean: false, seed: false}
    let sequelizeBinPath = options.sequelizeBinPath
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
        configPath: rc['config'],
        configRelPath: relPath
    })
    
    if (clean) {
        lib.utils.deleteFiles(rc['migrations-path'], (fName) => fName !== '.keep')
        let dbPath = require(rc['config'])[process.env.NODE_ENV].storage
        
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    }
    
    return lib.db.generateMigrations().then(() => lib.db.init({sequelizeBinPath: sequelizeBinPath, seed}))
}

const {AdministerSession, SessionHandler, CrudSession} = lib.session

class Bkendz {
    
    constructor(args) {
        args = args || {}
        this.administerEnabled = this._administer = args.administerEnabled
        this.apiEnabled = args.apiEnabled
        this.clientEnabled = args.clientEnabled
        this.standalone = _.isBoolean(args.standalone) ? args.standalone : false
    
        if(args.enableOnly === 'admin'){
            args.enableOnly = this.constructor.PROCESS_NAME_ADMIN
        }
        
        if(_.includes(this.constructor.PROCESS_NAMES, args.enableOnly)){
            for(let procName of this.constructor.PROCESS_NAMES){
                this[`${procName}Enabled`] = args.enableOnly === procName
            }
        }
        
        if(this.standalone){
            this.apiEnabled = true
        }
        
        console.log(`[${this.constructor.name}] starting configuration: api=${this.apiEnabled}, client=${this.clientEnabled}, administer=${this.administerEnabled}, standalone=${this.standalone}`)
        
        this.optsAdmin = args.optsAdmin || {}
        this.optsApi = args.optsApi || {}
        this.optsClient = args.optsClient || {}
        
        this._sessAdmin = null
        this._sessClient = null
        this._sessApi = null
        this._listening = false
    }
    
    set apiSheet(as) {
        this.api.apiSheet = as || {}
    }
    
    get apiSheet() {
        return this.api.apiSheet
    }
    
    get admin() {
        if (!this._sessAdmin) this._sessAdmin = new this.constructor.DEFAULT_SESSION_CLS_ADMIN(this.optsAdmin)
        return this._sessAdmin
    }
    
    set admin(session){
        this._sessAdmin = session
    }
    
    get client() {
        if (!this._sessClient) this._sessClient = new this.constructor.DEFAULT_SESSION_CLS_CLIENT(this.optsClient)
        return this._sessClient
    }
    
    set client(session){
        this._sessClient = session
    }
    
    get api() {
        if (!this._sessApi) this._sessApi = new this.constructor.DEFAULT_SESSION_CLS_API(_.merge({apiSheet: this.apiSheet}, this.optsApi))
        return this._sessApi
    }
    
    set api(apiSession){
        this._sessApi = apiSession
    }
    
    listen(port) {
    
        if(this.apiEnabled){
            // this.api.models.sequelize.sync()
            //     .catch((error) => {
            //         console.error(`[${this.constructor.name}] error synchronising models (1):`, error)
            //
            //         let configPath = lib.utils.getRcConf()['config']
            //         let dirName = path.join(path.dirname(configPath), require(configPath).development.storage)
            //
            //         let cmd = `chown -R 777 ${path.dirname(dirName)}`
            //         console.log('[bkendz] executing command:', cmd)
            //         let exec = require('child_process').execSync
            //         return exec(cmd, {stdio: [0, 1, 2]})
            //     })
            //     .catch((error) => {
            //         console.error(`[${this.constructor.name}] error synchronising models (2):`, error)
            //     })
            //     .finally(() => {
                    this.api.servers.http.listen(port)
             //   })
            
        }
        
        if(this.standalone) port++
        
        if(this.administerEnabled) {
            this.admin.servers.http.listen(port)
        }
    
        if(this.standalone) port++
        
        if(this.clientEnabled){
            this.client.servers.http.listen(port)
        }
        
        this._listening = true
    }
}

Bkendz.DEFAULT_SESSION_CLS_ADMIN = AdministerSession
Bkendz.DEFAULT_SESSION_CLS_API = CrudSession
Bkendz.DEFAULT_SESSION_CLS_CLIENT = SessionHandler

Bkendz.PROCESS_NAME_ADMIN = 'administer'
Bkendz.PROCESS_NAME_API = 'api'
Bkendz.PROCESS_NAME_CLIENT = 'client'

Bkendz.PROCESS_NAMES = [Bkendz.PROCESS_NAME_ADMIN, Bkendz.PROCESS_NAME_CLIENT, Bkendz.PROCESS_NAME_API]

module.exports = {
    tasks,
    modelsSync,
    Bkendz,
    db: lib.db,
    util: lib.utils,
    sequelize: require('sequelize'),
    DbObject: lib.db.DbObject,
    SessionHandler,
    AdministerSession,
    ApiSessionHandler: CrudSession,
    ModelImporter: lib.db.ModelImporter,
    topic: lib.topic
}

if (require.main === module) {

}