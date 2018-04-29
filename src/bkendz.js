/**
 * Created by anthony on 02/02/2018.
 */

class Deferred {

    constructor() {
        this.id = `${this.constructor._ID++}`

        this.promise = new Promise((res, rej) => {
            this.resolve = res
            this.reject = rej
        })
    }

    cancel() {
        this.reject('Cancelled!')
    }

    then(...args) {
        this._promise = (this._promise || this.promise).then(...args)
        return this
    }

    catch(...args){
        this._promise = (this._promise || this.promise).catch(...args)
        return this
    }
}

Deferred._ID = 1

_.merge(WebSocket.prototype, Object.create(EventEmitter.prototype))

class LazyObject {
    
    constructor(getters){
        this[Symbol.for('getters')] = getters
        
        let properties = _.transform(getters, function(result, func, key) {
            result[key] = {
                get: func
            }
        }, {})
        Object.defineProperties(this, properties)
    }
    
}

class Bkendz extends EventEmitter {

    constructor() {
        super()
        this.retryCount = {api: 0, server: 0}
        this.deferreds = {}
        this.apiLocation = null
        this._templates = {}
        this._schema = null
        this._accessToken = null
        this.debugMode = false
    }

    connect(url, options = {}) {
        let ws = new WebSocket(url, 'echo-protocol')
        EventEmitter.call(ws)

        this.retryCount[options.retryCount]++


        let name = options.retryCount

        this[name] = ws

        let subscriptions = ws.subscriptons = {}

        ws.on = function (eventName, callback) {
            let topic = `/${eventName}`
            console.log(`${name}: event=${eventName}, topic=${topic}`)

            let subscribe = `/subscribe?subject=${eventName}`
            ws.json(subscribe)
                .then((resp) => {
                    subscriptions[resp.data.subscribed] = 0
                    console.log('subscriptions:', subscriptions)

                    EventEmitter.prototype.on.call(ws, eventName, callback)
                })
        }


        ws.json = (topic, data) => {
            let deferred = new Deferred()
            this.deferreds[deferred.id] = deferred

            if (!_.isPlainObject(data)) data = {}

            data.ACCESS_TOKEN = this.accessToken
            let req = {topic: `${topic}${_.includes(topic, '?') ? '&' : '?'}uid=${deferred.id}`, data: data}
            ws.send(JSON.stringify(req))
            return deferred
        }

        ws.onmessage = (message) => {
            let msg = JSON.parse(message.data)
            let parts = _.split(msg.topic, '?', 2)

            let parsed = _.chain(_.last(parts))
                .replace('?', '') // a=b454&c=dhjjh&f=g6hksdfjlksd
                .split('&') // ["a=b454","c=dhjjh","f=g6hksdfjlksd"]
                .map(_.partial(_.split, _, '=', 2)) // [["a","b454"],["c","dhjjh"],["f","g6hksdfjlksd"]]
                .fromPairs() // {"a":"b454","c":"dhjjh","f":"g6hksdfjlksd"}
                .value()

            let deferredId = parsed.uid
            let deferred = this.deferreds[deferredId]
            let topic = _.first(parts)

            if (_.isObject(deferred)) {
                delete this.deferreds[deferredId]

                if(msg.error) deferred.reject(new Error(`[${name}] ${topic}: ${msg.error}`))
                else deferred.resolve(msg)
            } else if (topic === '/subscribe' && parsed.subject in subscriptions) {
                subscriptions[parsed.subject]++
                ws.emit(parsed.subject, msg)
            } else {
                console.error('no pending promise', message, topic, parsed)
            }
        }

        return new Promise((resolve, reject) => {
            ws.onopen = () => {
                this.retryCount[options.retryCount] = 0
                this.emit(options.connected || 'server_connected')
                resolve(ws)
            }

            ws.onclose = () => {
                this.emit(options.disconnected || 'server_disconnected')
                reject()
            }

            ws.onerror = (err) => {
                console.error(err)
                reject(err)
            }
        })
    }

    connectToServer() {
        let url = `${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}`
        return this.connect(url, {
            connected: 'server_connected',
            disconnected: 'server_disconnected',
            retryCount: 'server'
        })
            .then((server) => {
                this.server = server
            })
    }

    connectToApi() {
        if (!this.apiLocation) Promise.reject(Error('No API location provided!'))
        let url = this.apiLocation[location.protocol === 'http:' ? 'ws' : 'wss']
        console.log('[connectToApi] url=', url, this.apiLocation)
        return this.connect(url, {connected: 'api_connected', disconnected: 'api_disconnected', retryCount: 'api'})
            .then((api) => {
                this.api = api
            })
    }

    init() {
        const emitWrap = (event) => {

            let emit = event.target.getAttribute(`data-emit-${event.type}`)
            emit = `${event.type}_${emit}`
            if (this.debugMode) console.log('[Directive] emitting:', emit)
            this.emit(emit, event)
        }

        ['keyup', 'click', 'change'].forEach((eventType) => {
            $(document).on(eventType, `[data-emit-${eventType}]`, emitWrap)
        })

    }

    main() {
        return new Promise((resolve, reject) => {

            let start = () => {
                try {
                    this.init()
                    this.connectToServer().then(resolve)

                }catch (error){
                    reject(error)
                }
            }
            document.addEventListener('DOMContentLoaded', start)
        })
    }

    resolveAccess(email, password) {
        return this.api.json('/authenticate', {email: email, username: email, password})
            .then((resp) => {
                this.accessToken = resp.data.tokens.access
                return resp.data.tokens
            })
    }

    get accessToken() {
        return this._accessToken
    }

    set accessToken(token) {
        let currToken = this._accessToken
        this._accessToken = token
        this.emit('changed_accesstoken', token, currToken)
    }

    getTemplate(name, opts) {
        if (!_.isString(name)) throw new Error('template name must be string, found %s', name)

        opts = opts || {}
        let reload = _.isUndefined(opts.reload) ? true : opts.reload
        let rendered = opts.rendered || {}
        let cached = this._templates[name]

        if (reload || !_.isString(cached)) {
            return this.server.json(`/template?name=${name}`, {rendered}).then((res) => {
                this._templates[name] = res.data
                return res.data
            })
        } else {
            return Promise.resolve(cached)
        }
    }

    repeat(opts) {
        opts = opts || {}
        let name = opts.template
        let targetSelector = opts.target
        let inputList = opts.templateArgs || []
        let wrapperFn = opts.wrapFn || null
        return this.getTemplate(name)
            .then((rawStr) => {
                let compiled = _.template(rawStr)
                let target = $(targetSelector)
                _.each(inputList, (inputData, ...args) => {
                    let html = compiled(inputData)
                    if (wrapperFn) {
                        let r = wrapperFn(inputData, ...args)
                        if ('append' in r) html += r.append
                        if ('prepend' in r) html = r.prepend + html
                    }
                    let el = $(html)
                    target.append(el)
                })
            })
    }

    fetch(modelName, options) {
        return this.api.json(`/fetch?model=${modelName}`, options || {})
    }

    set dbSchema(schema) {
        let oldAs = this._schema
        this._schema = schema
        this.emit('changed_dbschema', schema, oldAs)
    }

    get dbSchema() {
        return this._schema
    }

}

Bkendz.VERSION = Bkendz.version = '<%= package.version %>'