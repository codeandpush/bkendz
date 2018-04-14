/**
 * Created by anthony on 14/04/2018.
 */

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
    
    if(!app.apiLocation){
        app.server.json('/api', location).then((res) => {
            app.apiLocation = res.data
            console.log('[API LOCATION] ', res)
            app.connectToApi()
        })
    }
})

app.on('api_disconnected', () => {
    console.log('api disconnected')
    setTimeout(() => app.connectToApi(), 1000 * app.retryCount.api)
})

app.on('api_connected', () => {
    console.log('api connected')
    
    if(!app.dbSchema){
        app.api.json('/as').then((resp) => {
            app.dbSchema = resp.data
            let usersTable = app.gridOptions // init table
        })
    }
    
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