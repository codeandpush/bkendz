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
}

Deferred._ID = 1

class BkendzAdmin extends EventEmitter3 {
    
    constructor() {
        super()
        this.retryCount = {api: 0, server: 0}
        this.deferreds = {}
        this._schema = null
        this._gridOptions = null
    }
    
    get elems() {
        return {
            connectionAlert: $('#connection_alert'),
            // usersGridDiv: $(document.querySelector('#grid_user')),
            // itemsGridDiv: $(document.querySelector('#grid_presentation')),
            searchInput: $(document.querySelector('#search_term')),
            searchResultsItem: $(document.querySelector('#search_items')),
            searchResultsUser: $(document.querySelector('#search_users')),
            searchResultsContainer: $('#search_results_container')
        }
    }
    
    connect(url, options = {}) {
        let ws = new WebSocket(url, 'echo-protocol')
        this.retryCount[options.retryCount]++
        
        _.merge(WebSocket.prototype, Object.create(EventEmitter3.prototype))
        EventEmitter3.call(ws)
        
        let name = options.retryCount
        
        let subscriptions = ws.subscriptons = {}
        
        ws.on = function (eventName, callback) {
            let topic = `/${eventName}`
            console.log(`${name}: event=${eventName}, topic=${topic}`)
            
            let subscribe = `/subscribe?subject=${eventName}`
            ws.json(subscribe)
                .then((resp) => {
                    subscriptions[resp.data.subscribed] = 0
                    console.log('subscriptions:', subscriptions)
                    
                    EventEmitter3.prototype.on.call(ws, eventName, callback)
                })
        }
        
        ws.onopen = () => {
            this.retryCount[options.retryCount] = 0
            this.emit(options.connected || 'server_connected')
        }
        
        ws.onclose = () => {
            this.emit(options.disconnected || 'server_disconnected')
        }
        
        ws.onerror = (err) => {
            console.error(err)
        }
        
        ws.json = (topic, data) => {
            let deferred = new Deferred()
            this.deferreds[deferred.id] = deferred
            
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
                deferred.resolve(msg)
            } else if (topic === '/subscribe' && parsed.subject in subscriptions) {
                subscriptions[parsed.subject]++
                ws.emit(parsed.subject, msg)
            } else {
                console.error('no pending promise', message, topic, parsed)
            }
        }
        
        return ws
    }
    
    connectToServer() {
        let url = `${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}`
        this.server = this.connect(url, {
            connected: 'server_connected',
            disconnected: 'server_disconnected',
            retryCount: 'server'
        })
    }
    
    connectToApi() {
        let url = location.hostname.indexOf('localhost') === -1 ? 'wss://bkendz-api.herokuapp.com' : 'ws://localhost:9002'
        this.api = this.connect(url, {connected: 'api_connected', disconnected: 'api_disconnected', retryCount: 'api'})
    }
    
    get gridOptions(){
        if (this._gridOptions) return this._gridOptions
        
        let opts = this._gridOptions = {}
        
        _.each(this.dbSchema, (colDef, colName) => {
            let elem = document.querySelector(`#grid_${colName.toLowerCase()}`)
            
            if(!elem) return
            
            let columnDefs = []
            _.each(colDef, (attrType, attrName) => {
                columnDefs.push({headerName: _.startCase(attrName), field: attrName})
            })
    
            columnDefs = _.sortBy(columnDefs, (d) => _.includes(['createdAt', 'updatedAt'], d.field))
    
            let gridOpts = opts[_.camelCase(colName)] = {debug: false,
                enableSorting: true,
                enableColResize: true,
                rowData: [],
                columnDefs: columnDefs,
                enableFilter: true,
                floatingFilter: true,
                animateRows: true,
                getRowNodeId: function(data) {
                    return data.id
                }
            }
            
            new agGrid.Grid(elem, gridOpts)
        })
        return opts
    }
    
    static newSearchResult(kwargs) {
        let searchResElem = this._SEARCH_RESULT_POOL.shift()
        let defaultOpts = {
            thumbnail_url: 'http://www.aber.ac.uk/staff-profile-assets/img/noimg.png',
            title: '',
            description: ''
        }
        
        kwargs = _.merge(defaultOpts, kwargs)
        
        if (searchResElem) {
            searchResElem = $(searchResElem)
            searchResElem.find('p').text(kwargs.description || kwargs.email)
            searchResElem.find('.media-heading a').text(kwargs.title || kwargs.name)
            searchResElem.find('img').attr('src', kwargs.thumbnail_url)
        } else {
            searchResElem = $(_.template(this.TEMPLATE_SEARCH_RESULT)(kwargs))
        }
        
        searchResElem.prop('hidden', false)
        return searchResElem
    }
    
    static deleteSearchResult(searchResult) {
        $(searchResult).prop('hidden', true)
        this._SEARCH_RESULT_POOL.push(searchResult)
    }
    
    init() {
        const emitWrap = (event) => {
            let emit = event.target.getAttribute(`data-emit-${event.type}`)
            this.emit(`${event.type}_${emit}`, event)
        }
        
        ['keyup', 'click'].forEach((eventType) => {
            $(document).on(eventType, `[data-emit-${eventType}]`, emitWrap)
        })
        
    }
    
    set dbSchema(schema){
        this._schema = schema
    }
    
    get dbSchema(){
        return this._schema
    }
}

window.app = new BkendzAdmin()

BkendzAdmin._SEARCH_RESULT_POOL = []

app.on('server_disconnected', () => {
    console.log('server disconnected')
    app.elems.connectionAlert.show().slideDown()
    setTimeout(() => app.connectToServer(), 1000 * app.retryCount.server)
})

app.on('server_connected', () => {
    console.log('server connected')
    app.elems.connectionAlert.slideUp().hide()
})

app.on('api_disconnected', () => console.log('api disconnected'))

app.on('api_connected', () => {
    console.log('api connected')
    let usersTable = app.gridOptions // init table
    
    function updateOrInsert(data, gridApi) {
        let rowNode = gridApi.getRowNode(data.id)
        
        if (rowNode) {
            rowNode.setData(data)
        } else {
            gridApi.updateRowData({add: [data]})
        }
    }
    
    app.api.on('db_update', (msg) => {
        console.log('db update:', msg)
        
        for (let update of msg.data.updates) {
            let gridAttrName = _.camelCase(update.value.type)
            
            if(!app.gridOptions[gridAttrName]) continue
            
            let api = app.gridOptions[gridAttrName].api
            updateOrInsert(update.value, api)
        }
        
    })
})

app.on('submitted_search', (term) => {
    app.api.json(`/search?q=${term}`)
        .then((resp) => {
            
            $('.search-result-item').each((idx, elem) => {
                BkendzAdmin.deleteSearchResult(elem)
            })
            
            if (_.isEmpty(resp.data.results)) {
                $('#search_results_filter').find('[role="presentation"]').addClass('disabled').removeClass('active')
            }
            else {
                $('#search_results_filter').find('[role="presentation"]').removeClass('disabled')
                app.elems.searchResultsContainer.find('.tab-pane').addClass('in active')
            }
            
            for (let searchResultKwargs of resp.data.results) {
                let elem = BkendzAdmin.newSearchResult(searchResultKwargs)
                
                switch (searchResultKwargs.$type) {
                    case 'RentalItem':
                        app.elems.searchResultsItem.append(elem)
                        break
                    case 'User':
                        app.elems.searchResultsUser.append(elem)
                        break
                }
                
            }
        })
})

app.on('click_search', () => {
    app.emit('submitted_search', app.elems.searchInput.val())
})

app.on('keyup_search', (ev) => {
    //if (ev.which === 13)
    app.emit('submitted_search', app.elems.searchInput.val())
})

app.on('click_show_all_search_result', () => {
    app.elems.searchResultsContainer.find('.tab-pane').addClass('in active')
})

//app.connectToApi()

document.addEventListener('DOMContentLoaded', function () {
    // lookup the container we want the Grid to use
    console.log('DOM loaded')
    app.init()
    
    app.connectToServer()
    app.connectToApi()
    
});

BkendzAdmin.TEMPLATE_SEARCH_RESULT = `
<ul class="media-list search-result-item">
    <li class="media" data-thumbnail="<%= thumbnail_url %>">
        <div class="media-left media-middle">
            <a href="#" data-category="app">
                <img width="64px" height="64px" style="border-radius: 4px;background-color: aliceblue" class="media-object" src="<%= thumbnail_url %>" alt="product image">
            </a>
        </div>
        <div class="media-body">
            <h4 class="media-heading"><a href="#"><%= title || name %></a></h4>
            <p><%= description || email %></p>
        </div>
    </li>
</ul>
`