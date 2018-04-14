/**
 * Created by anthony on 13/04/2018.
 */

class BkendzAdmin extends Bkendz {
    
    constructor() {
        super()
        this._schema = null
        this._gridOptions = null
    }
    
    get elems() {
        return {
            connectionAlert: $('#connection_alert'),
            searchInput: $(document.querySelector('#search_term')),
            searchResultsItem: $(document.querySelector('#search_items')),
            searchResultsUser: $(document.querySelector('#search_users')),
            searchResultsContainer: $('#search_results_container')
        }
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
    
    set dbSchema(schema){
        this._schema = schema
    }
    
    get dbSchema(){
        return this._schema
    }
}