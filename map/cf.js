function init(){var o=L.icon({iconUrl:"https://cubityfir.st/map/images/marker-icon.png",shadowUrl:"https://cubityfir.st/map/images/marker-shadow.png", iconAnchor:[12, 40], shadowAnchor: [12, 40], popupAnchor:[0,-40]});L.CRS.MySimple=L.extend({},L.CRS.Simple,{transformation:new L.Transformation(1/128,128,1/128,128)});var t=L.map("x",{maxZoom:7,minZoom:2,crs:L.CRS.MySimple}).setView([0,0],7);window.latLngToPixels=function(o){return window.map.project([o.lat,o.lng],window.map.getMaxZoom())},window.pixelsToLatLng=function(o,t){return window.map.unproject([o,t],window.map.getMaxZoom())};var e=L.latLngBounds([[-16384,-16384],[16384,16384]]);L.tileLayer("maps/{z}/{x}/{y}.png",{minZoom:0,maxZoom:7,bounds:e,noWrap:!0,tms:!1}).addTo(t), 

L.marker([3106,2526],{icon:o}).addTo(t).bindPopup("/warp whynotshop")
L.marker([0,0],{icon:o}).addTo(t).bindPopup("/spawn")
L.marker([-171,407],{icon:o}).addTo(t).bindPopup("/warp batcave")
L.marker([483,-1184],{icon:o}).addTo(t).bindPopup("/warp deepblue")
L.marker([995,1009],{icon:o}).addTo(t).bindPopup("/warp lambo")
L.marker([4775,4290],{icon:o}).addTo(t).bindPopup("/warp monument")
L.marker([-198,0],{icon:o}).addTo(t).bindPopup("/warp summit")
L.marker([351,51],{icon:o}).addTo(t).bindPopup("/warp town")
L.marker([3106,2526],{icon:o}).addTo(t).bindPopup("/warp whynot")
L.marker([3741,-9431],{icon:o}).addTo(t).bindPopup("/warp zoo")

,L.Control.Coordinates.include({_update:function(o){var t=o.latlng,e=this.options;t&&(this._currentPos=t,this._inputY.value=L.NumberFormatter.round(t.lat,e.decimals,e.decimalSeperator),this._inputX.value=L.NumberFormatter.round(t.lng,e.decimals,e.decimalSeperator),this._label.innerHTML=this._createCoordinateLabel(t))}}),L.control.coordinates({position:"bottomleft",decimals:0,decimalSeperator:".",labelTemplateLat:"Z: {y}",labelTemplateLng:"X: {x}",useLatLngOrder:!0}).addTo(t),document.getElementsByClassName("leaflet-control-attribution")[0].style.fontSize="0px"}