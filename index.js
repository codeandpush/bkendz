/**
 * Created by anthony on 18/03/2018.
 */

const tasks = require('./tasks')
const fs = require('fs'), path = require('path'), lib = require('./lib'), _ = require('lodash')

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

class SessionHandler extends lib.EventBus {

    constructor(role){
        super()
        this.role = role
    }

    static originIsAllowed(origin) {
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }

    onPrefChanged(){

    }

    create(){

    }

    update(){

    }

    service(){

    }
}

SessionHandler.ROLE_CUSTOMER = 'Customer'
SessionHandler.ROLE_EMPLOYEE = 'Staff'

class CrudSession extends SessionHandler {

}

class AdministerSession extends SessionHandler {
    constructor(){
        super()
    }

}

class Bkendz {

    constructor(args){
        this._administer = args.administerEnabled
        this._sessAdmin = null
        this._sessClient = null
        this._sessApi = null
    }

    get adminWs(){
        if(this._adminWs) return this._adminWs

        let wsServer = require('./server').wsServer
        const messageHandler = require('./message_handler')

        let self = this
        wsServer.on('request', (request) => {
            if (!self.admin.constructor.originIsAllowed(request.origin)) {
                // Make sure we only accept requests from an allowed origin
                request.reject();
                console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
                return;
            }

            const connection = request.accept('echo-protocol', request.origin);

            connection._resourceURL = request.resourceURL
            console.log((new Date()) + ' Connection accepted.')
    
            connection.send = function (topic, resp) {
                switch (resp.type) {
                    case 'utf8':
                        let dataStr = resp
                
                        if (_.isObject(dataStr) && topic && !('topic' in dataStr)) {
                            dataStr.topic = topic
                        }
                
                        if (!_.isString(dataStr)) {
                            dataStr = JSON.stringify(dataStr);
                        }
                
                        this.sendUTF(dataStr, (error) => {
                            if (error) {
                                console.error(error)
                            } else {
                                console.log('message sent:', dataStr.slice(0, 100))
                            }
                        })
                        break;
                    case 'binary':
                        this.sendBytes(resp.binaryData);
                        break;
                    default:
                        throw Error(`unknown response data type ${resp.dataType}`)
                }
            }
            
            const wsHandler = messageHandler.wsHandler

            const handleMessage = _.partial(wsHandler.handleMessage, connection).bind(wsHandler)
            connection.on('message', (...args) => {

                try {
                    handleMessage(...args)
                        .then((res) => {
                            self.admin.emit('request', wsHandler, res, connection)
                        })
                }catch (error){
                    console.error(error)
                }
            })

            connection.on('close', function(reasonCode, description){
                messageHandler.wsHandler.onClose(this, reasonCode, description)
            })

        })

        this._adminWs = {server: wsServer, messageHandler: messageHandler.wsHandler}
        return this._adminWs
    }

    get adminHttp(){
        let sv = require('./server')
        return {messageHandler: sv.app, server: sv.server}
    }

    get admin(){
        if(!this._sessAdmin) this._sessAdmin = new AdministerSession()
        return this._sessAdmin
    }

    get client(){
        if(!this._sessClient) this._sessClient = new SessionHandler()
        return this._sessClient
    }

    get api(){
        if(!this._sessApi) this._sessApi = new CrudSession()
        return this._sessApi
    }

    set administerEnabled(enabled){
        this._administer = true
        //this.emit('administer_changed', enabled)
    }

    listen(port){
        `listening on port ${port}`
        this.adminHttp.server.listen(port)
        let _adminWs = this.adminWs
    }
}

Bkendz.DEFAULT_HANDERS = {

}

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

if(require.main === module){

}