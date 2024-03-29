Ext.ns('App');

// Allows cross-domain requests for the restful_geof call in onItemTap
Ext.Ajax.useDefaultXhrHeader = false;

/**
 * Custom class for the Search 
 */
App.SearchFormPopupPanel = Ext.extend(Ext.Panel, {
    map: null,
    floating: true,
    modal: true,
    centered: true,
    hideOnMaskTap: true,
    width: Ext.is.Phone ? undefined : 400,
    height: Ext.is.Phone ? undefined : 500,
    scroll: false,
    layout: 'fit',
    fullscreen: Ext.is.Phone ? true : undefined,
    url: 'http://basemap.pozi.com/ws/rest/v3/ws_search_api_wrapper.php',
    errorText: 'Sorry, we had problems communicating with Pozi search. Please try again.',
    errorTitle: 'Communication error',
    maxResults: 6,
    featureClass: "P",
    
    createStore: function(){
        this.store = new Ext.data.JsonStore({
            autoLoad: false, //autoload the data
            root: 'features',
            fields: [{name: "label" , mapping:"properties.label"},
                {name: "gsln"   , mapping:"properties.gsln"},
                {name: "idcol"  , mapping:"properties.idcol"},
                {name: "idval"  , mapping:"properties.idval"},
                {name: "ld" , mapping:"properties.ld"}
            ],
              proxy: new Ext.data.ScriptTagProxy({
                url: this.url,
                timeout: 5000,
                listeners: {
                    exception: function(){
                        this.hide();
                        Ext.Msg.alert(this.errorTitle, this.errorText, Ext.emptyFn);
                    },
                    scope: this
                },
                reader:{
                    root:'features'
                }
              })
    });
    },
    
    doSearch: function(searchfield, evt){
        var q = searchfield.getValue();
        this.store.load({
            params: {
                query: q,
                config: 'basemap',
                lga:'346'
            }
        });
    },
    
    onItemTap: function(dataView, index, item, event){
        var record = this.store.getAt(index);

        var url_object = "http://basemap.pozi.com/api/v1/basemap/" + record.data.gsln + "/" + record.data.idcol +  "/is/" + encodeURIComponent(record.data.idval);
        if (record.data.lgacol && record.data.lga)
        {
            url_object += "/"+ record.data.lgacol +"/in/" + record.data.lga;
        }

        Ext.Ajax.request({
            method: "GET",
            url: url_object,
            params: {},
            callback: function(options, success, response) {
                var status = response.status;
                if (status >= 200 && status < 403 && response.responseText) {
                    // We then feed the object returned into the highlight layer
                    var geojson_format = new OpenLayers.Format.GeoJSON({
                        'internalProjection': new OpenLayers.Projection("EPSG:900913"),
                        'externalProjection': new OpenLayers.Projection("EPSG:4326")
                    });
                    var geojson = geojson_format.read(response.responseText);

                    // Calculating the overall envelope of all objects returned
                    var envelope = geojson[0].geometry.getBounds();
                    for (var i=1;i<geojson.length;i++)
                    {
                        envelope.extend(geojson[i].geometry.getBounds());
                    }

                    var lonlat = new OpenLayers.LonLat((envelope.left + envelope.right) / 2, (envelope.top + envelope.bottom) / 2);
                    map.setCenter(lonlat, 18);
                    app.searchFormPopupPanel.hide("pop");
                }
            }
        });
    },
    
    initComponent: function(){
        this.createStore();
        this.resultList = new Ext.List({
            scroll: 'vertical',
            cls: 'searchList',
            loadingText: "Searching ...",
            store: this.store,
            itemTpl: '<div>{label}</div>',
            listeners: {
                itemtap: this.onItemTap,
                scope: this
            }
        });
        this.formContainer = new Ext.form.FormPanel({
            scroll: false,
            items: [{
                xtype: 'button',
                cls: 'close-btn',
                ui: 'decline-small',
                text: 'Close',
                handler: function(){
                    this.hide();
                },
                scope: this 
            }, {
                xtype: 'fieldset',
                scroll: false,
                title: 'Search for a place',
                items: [{
                    xtype: 'searchfield',
                    label: 'Search',
                    placeHolder: 'placename',
                    listeners: {
                        action: this.doSearch,
                        scope: this
                    }
                },
                    this.resultList
                ]
            }]
        });
        this.items = [{
            xtype: 'panel',
            layout: 'fit',
            items: [this.formContainer]
        }];
        App.SearchFormPopupPanel.superclass.initComponent.call(this);
    }
});

App.LayerList = Ext.extend(Ext.List, {
    
    map: null,
    
    createStore: function(){
        Ext.regModel('Layer', {
            fields: ['id', 'name', 'visibility', 'zindex']
        });
        var data = [];
        Ext.each(this.map.layers, function(layer){
            if (layer.displayInLayerSwitcher === true) {
                var visibility = layer.isBaseLayer ? (this.map.baseLayer == layer) : layer.getVisibility();
                data.push({
                    id: layer.id,
                    name: layer.name,
                    visibility: visibility,
                    zindex: layer.getZIndex()
                });
            }
        });
        return new Ext.data.Store({
            model: 'Layer',
            sorters: 'zindex',
            data: data
        });
    },
    
    initComponent: function(){
        this.store = this.createStore();
        this.itemTpl = new Ext.XTemplate(
            '<tpl if="visibility == true">', 
                '<img width="20" src="img/check-round-green.png">', 
            '</tpl>', 
            '<tpl if="visibility == false">', 
                '<img width="20" src="img/check-round-grey.png">', 
            '</tpl>', 
            '<span class="gx-layer-item">{name}</span>'
        );
        this.listeners = {
            itemtap: function(dataview, index, item, e){
                var record = dataview.getStore().getAt(index);
                var layer = this.map.getLayersBy("id", record.get("id"))[0];
                if (layer.isBaseLayer) {
                    this.map.setBaseLayer(layer);
                }
                else {
                    layer.setVisibility(!layer.getVisibility());
                }
                record.set("visibility", layer.getVisibility());
            }
        };
        this.map.events.on({
            "changelayer": this.onChangeLayer,
            scope: this
        });
        App.LayerList.superclass.initComponent.call(this);
    },

    findLayerRecord: function(layer){
        var found;
        this.store.each(function(record){
            if (record.get("id") === layer.id) {
                found = record;
            }
        }, this);
        return found;
    },
    
    onChangeLayer: function(evt){
        if (evt.property == "visibility") {
            var record = this.findLayerRecord(evt.layer);
            record.set("visibility", evt.layer.getVisibility());
        }
    }
    
});
Ext.reg('app_layerlist', App.LayerList);



App.CaptureFormPopupPanel = Ext.extend(Ext.Panel, {
	map: null,
	propertyAddressStore: null,
	floating: true,
	modal: true,
	centered: true,
	// Deactivated mask on tap to allow for selection in the drop down list
	hideOnMaskTap: false,
	width: Ext.is.Phone ? undefined : 400,
	height: Ext.is.Phone ? undefined : 400,
	scroll: false,
	layout: 'fit',
	fullscreen: Ext.is.Phone ? true : undefined,
	//    url: '/ws/rest/v3/capture/ws_property_fire_hazard.php',
	errorText: 'Sorry, we had problems communicating with the Pozi server. Please try again.',
	errorTitle: 'Communication error',
        
	initComponent: function(){
		Ext.regModel('PropertyAddress', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'prop_num',
			fields: [
				{name: 'label',     type: 'string', mapping: 'row.label'},
				{name: 'prop_num',    type: 'string', mapping: 'row.prop_num'},
				{name: 'x',     type: 'string', mapping: 'row.x'},
				{name: 'y',     type: 'string', mapping: 'row.y'}
			]
		});

		Ext.regModel('ReferenceTable', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'id',
			fields: [
				{name: 'id',     type: 'string'},
				{name: 'label',    type: 'string'}
			]
		});

		// Be careful to the refresh timeline of the content - it has to be refreshed each time the form is invoked
		propertyAddressStore = new Ext.data.JsonStore({
			proxy: {
				type: 'scripttag',
				url : 'http://basemap.pozi.com/ws/rest/v3/ws_closest_properties.php',
				reader: {
					type: 'json',
					root: 'rows',
					totalCount : 'total_rows'
				}
			},
			// Max number of records returned
			pageSize: 10,	
			model : 'PropertyAddress',
			autoLoad : false,
			autoDestroy : true,
			listeners: {
				load: function(ds,records,o) {
					var cb = Ext.getCmp('prop_num');
					var rec = records[0];
					cb.setValue(rec.data.type);
					cb.fireEvent('select',cb,rec);
					},
				scope: this
			}
		});
		
		hazardTypeDataStore = new Ext.data.JsonStore({
	           data : [
	                { id : '1',  label : '1 - Full Cut'},
	                { id : '2', label : '2 - Fire Break'},
	                { id : '3', label : '3 - Other'}
	           ],
	           model: 'ReferenceTable'
	        });

		this.formContainer = new Ext.form.FormPanel({
			id:'form_capture',
			scroll: false,
			items: [{
				xtype: 'fieldset',
				scroll: false,
				title: 'Enter new hazard',
				items: [{
					xtype: 'selectfield',
					label: 'Property',
					name:'prop_num',
					id:'prop_num',
					valueField : 'prop_num',
					displayField : 'label',
					store : propertyAddressStore,
					// By construction, this field will always be populated - so we technically don't have to mark it as required
					 required: true
		                },
				{
					xtype: 'textfield',
					label: 'Comments',
					name:'comments'
		                },
				{
					xtype: 'selectfield',
					label: 'Type',
					name:'haz_type',
					id:'haz_type',
					valueField : 'id',
					displayField : 'label',
					store : hazardTypeDataStore,
					// By construction, this field will always be populated - so we technically don't have to mark it as required
					 required: true
		                },
				{  
					xtype:'hiddenfield',
					name:'lat', 
					value: map.getCenter().transform(sm,gg).lat
				},
				{  
					xtype:'hiddenfield',
					name:'add_label'
				},
				{  
					xtype:'hiddenfield',
					name:'lon',
					value: map.getCenter().transform(sm,gg).lon
				},
				{  
					xtype:'hiddenfield',
					name:'config',
					value: 'mitchellgis'
				},
				{  
					xtype:'hiddenfield',
					name:'x'
				},
				{  
					xtype:'hiddenfield',
					name:'y'
				},
				{  
					xtype:'hiddenfield',
					name:'lga',
					value: '346'
				}  				
		                ]
			}],
			dockedItems: [{
				xtype: 'toolbar',
				dock: 'bottom',
				items: [{
					text: 'Cancel',
					handler: function() {
						// Important: clear the store elements before resetting the form
						while(propertyAddressStore.getCount()>0)
						{
							propertyAddressStore.removeAt(0);
						}
						Ext.getCmp('form_capture').reset();
						app.captureFormPopupPanel.hide();
					}
				},
				{xtype: 'spacer'},
				{
					text: 'Save',
					ui: 'confirm',
					handler: function() {
						// Setting the value of the address label, X and Y hidden parameters
						var ds = Ext.getCmp('form_capture').getFields().prop_num.store.data.items;
						for (i in ds)
						{
							if (ds.hasOwnProperty(i))
							{
								if (ds[i].data.prop_num == Ext.getCmp('form_capture').getValues().prop_num)
								{
									Ext.getCmp('form_capture').setValues({ 
										add_label:ds[i].data.label,
										x:ds[i].data.x,
										y:ds[i].data.y
									});
									break;
								}
							}
						}

						Ext.getCmp('form_capture').submit({
							url: '/ws/rest/v3/ws_create_property_fire_hazard.php',
							submitEmptyText: false,
							method: 'POST',
							waitMsg: 'Saving ...',
							success: on_capture_success,
							failure: on_capture_failure
						});
					}
				}]
			}]
		});
        
		var on_capture_success = function(form, action){
			// Important: clear the store elements before resetting the form
			while(propertyAddressStore.getCount()>0)
			{
				propertyAddressStore.removeAt(0);
			}
			Ext.getCmp('form_capture').reset();
			app.captureFormPopupPanel.hide();
			
			// Reload the vector layer - it should contain the new point
			getFeatures();
		};

		var on_capture_failure = function(form, action){
			alert("Capture failed");
		};
        
		this.items = [{
			xtype: 'panel',
			layout: 'fit',
			items: [this.formContainer]
		}];
		App.CaptureFormPopupPanel.superclass.initComponent.call(this);
	},
	listeners : {
		show:function(){
			if (propertyAddressStore)
		    	{
				if (propertyAddressStore.getCount() > 0)
				{
					// This should not happen as we empty the store on save and cancel
					alert('store exists and is populated');
					
				}
				else
				{
					// Populate the combo on show
					var latlon = map.getCenter();
					latlon.transform(sm, gg);
					propertyAddressStore.load({params:{longitude:latlon.lon,latitude:latlon.lat,config:'basemap'}});

				}				
			}
			else
			{
				// Unclear if this is a valid scenario
				alert('store does not exist');
			}
		    },
	}

});



App.CaptureUpdateFormPopupPanel = Ext.extend(Ext.Panel, {
	map: null,
	feature: null,
	floating: true,
	modal: true,
	centered: true,
	// Deactivated mask on tap to allow for selection in the drop down list
	hideOnMaskTap: false,
	width: Ext.is.Phone ? undefined : 400,
	height: Ext.is.Phone ? undefined : 400,
	scroll: false,
	layout: 'fit',
	fullscreen: Ext.is.Phone ? true : undefined,
	errorText: 'Sorry, we had problems communicating with the Pozi server. Please try again.',
	errorTitle: 'Communication error',

	setFeature: function(f){
		this.formContainer.setValues({
			'prop_num2':f.data.add_label,
			'comments':f.data.comments,
			'haz_type':f.data.haz_type,
			'haz_status':f.data.haz_status,
			'haz_id':f.data.id
		});
		
	},
        
	initComponent: function(){
		Ext.regModel('ReferenceTable', {
			// Potential issue if property numbers are repeated or missing - would be better to use a real PK for the Id field
			idProperty:'id',
			fields: [
				{name: 'id',     type: 'string'},
				{name: 'label',    type: 'string'}
			]
		});
		
		hazardTypeDataStore = new Ext.data.JsonStore({
	           data : [
	                { id : '1',  label : '1 - Full Cut'},
	                { id : '2', label : '2 - Fire Break'},
	                { id : '3', label : '3 - Other'}
	           ],
	           model: 'ReferenceTable'
	        });

		hazardStatusDataStore = new Ext.data.JsonStore({
	           data : [
	                { id : '1',  label : ''},
	                { id : '2', label : 'Non Compliant'}
	           ],
	           model: 'ReferenceTable'
	        });

    
		this.formContainer = new Ext.form.FormPanel({
			id:'form_capture_update',
			scroll: false,
			items: [{
				xtype: 'fieldset',
				scroll: false,
				title: 'Update existing hazard',
				items: [{
					xtype: 'textfield',
					label: 'Property',
					name:'prop_num2',
					id:'prop_num2',
					disabled: true,
					 required: true,
					 value: clickedFeature.data.add_label
		                },
				{
					xtype: 'textfield',
					label: 'Comments',
					name:'comments',
					value: clickedFeature.data.comments
		                },
				{
					xtype: 'selectfield',
					label: 'Type',
					name:'haz_type',
					id:'haz_type',
					valueField : 'id',
					displayField : 'label',
					store : hazardTypeDataStore,
					// By construction, this field will always be populated - so we technically don't have to mark it as required
					 required: true,
					 value: clickedFeature.data.haz_type
		                },
				{
					xtype: 'selectfield',
					label: 'Status',
					name:'haz_status',
					id:'haz_status',
					valueField : 'id',
					displayField : 'label',
					store : hazardStatusDataStore,
					// By construction, this field will always be populated - so we technically don't have to mark it as required
					 required: false,
					 value: clickedFeature.data.haz_status
		                },
				{  
					xtype:'hiddenfield',
					name:'haz_id',
					value: clickedFeature.data.id
				},
				{  
					xtype:'hiddenfield',
					name:'config',
					value: 'mitchellgis'
				},
				{  
					xtype:'hiddenfield',
					name:'lga',
					value: '346'
				}
		                ]
			}],
            
			dockedItems: [{
				xtype: 'toolbar',
				dock: 'bottom',
				items: [{
					text: 'Cancel',
					handler: function() {
						// Something wrong in this handler - we can't click twice on the same pin
						Ext.getCmp('form_capture_update').reset();
						app.captureUpdateFormPopupPanel.hide();
						selectControl.unselectAll();
					}
				},
				{xtype: 'spacer'},
				{
				    text: 'Delete',
				    ui: 'decline-round',
				    handler: function() {
				    
					Ext.Msg.confirm("Are you sure you want to delete this fire hazard? This operation can not be undone.", "", 
						function(e){
							if(e == 'yes')
							{
								// Call the delete service	
								Ext.Ajax.request({
								  loadMask: true,
								  url: '/ws/rest/v3/ws_delete_property_fire_hazard.php',
								  params: {
										haz_id: clickedFeature.data.id,
										config: 'mitchellgis',
										lga: '346'
									},
								  success: on_capture_success,
								  failure: on_capture_failure
								});
							}
						}
				    	);		

				    }			
				},
				{xtype: 'spacer'},				
				{
					text: 'Save',
					ui: 'confirm',
					handler: function() {
						Ext.getCmp('form_capture_update').submit({
							url: '/ws/rest/v3/ws_update_property_fire_hazard.php',
							submitEmptyText: false,
							method: 'POST',
							waitMsg: 'Saving ...',
							success: on_capture_success,
							failure: on_capture_failure
						});
					}
				}]
			}]
		});
        
		var on_capture_success = function(form, action){
			// Important: clear the store elements before resetting the form
			Ext.getCmp('form_capture_update').reset();
			app.captureUpdateFormPopupPanel.hide();
			
			// Reload the vector layer - it should contain the new point
			getFeatures();
		};

		var on_capture_failure = function(form, action){
			alert("Capture failed");
		};
        
		this.items = [{
			xtype: 'panel',
			layout: 'fit',
			items: [this.formContainer]
		}];
		App.CaptureUpdateFormPopupPanel.superclass.initComponent.call(this);
	}
});
