/**
 * @class BusPositionSceneController
 * @description
 *
 * @author Massimo De Marchi
 * @created 3/10/15.
 */
function VehiclesPositionSceneController() {
    SceneController.call(this);

    /*---------------- PRIVATE ATTRIBUTES ----------------*/
    var self = this;

    var _geometryBuffer;
    var _mesh = null;

    var _trips = null;
    var _allTrips = null;
    var _needUpdate = false;

    var _vehiclesBufferMapping = {};

    var _circlesNumber = 1;

    var _circlesOpacities = {
        max: 1.0,
        min: 0.95
    };

    var _vehicleSizes = {
        max: 40,
        min: 40
    };

    var _animationIncrement = 0.002;


    /*------------------ PUBLIC METHODS ------------------*/
    /**
     * @override
     * Update the model of the scene
     */
    this.update = function() {
        if(_trips != null) {
            if(__model.getAnimationModel().getState() == AnimationState.START) {
                if(_needUpdate) {
                    _allTrips = __model.getCTAModel().getTrips();
                    updateAnimation();
                    _needUpdate = false;
                }
            } else {
                /*
                 for(i = 0; i < size.length; i++) {
                 if(size[i] > 0) {
                 for(var j = 0; j < _circlesNumber; j++) {
                 if(opacity[j] < _circlesOpacities.max) {
                 opacity[j] += _animationIncrement;
                 } else {
                 opacity[j] = _circlesOpacities.min;
                 }
                 size[j] = (_circlesOpacities.max - opacity[j]) * 100 + _vehicleSizes.min;
                 }
                 }
                 }*/
                var currentTime = Utils.nowToSeconds();

                var size = _geometryBuffer.attributes.size.array;
                var position = _geometryBuffer.attributes.position.array;
                var opacity = _geometryBuffer.attributes.vertexOpacity.array;

                for(var tripId in _trips) {
                    var vehicleData = _trips[tripId];

                    // Compute vehicle last stop
                    var previousStopIndex = getLastStopIndex(currentTime, vehicleData["stops"]);

                    // Compute relevance of the vehicle position (if not relevant then do not display it or use low opacity)
                    var relevant = vehicleData["stops"][previousStopIndex +1]["relevant"];
                    relevant = relevant == undefined ? true : relevant;

                    if(previousStopIndex > -1 && relevant) {
                        // Compute next stop time in seconds
                        var next = vehicleData["stops"][previousStopIndex +1]["arrivalTime"];
                        next = Utils.toSeconds(next.hh, next.mm, next.ss);

                        // Compute previous stop time in seconds
                        var previous = vehicleData["stops"][previousStopIndex]["departureTime"];
                        previous = Utils.toSeconds(previous.hh, previous.mm, previous.ss);

                        // Compute time passed from the previous stop
                        var delta = (currentTime - previous) / (next - previous);
                        var lat = d3.interpolateNumber(
                            parseFloat(vehicleData["stops"][previousStopIndex]["lat"]),
                            parseFloat(vehicleData["stops"][previousStopIndex +1]["lat"])
                        )(delta);
                        var lon = d3.interpolateNumber(
                            parseFloat(vehicleData["stops"][previousStopIndex]["lon"]),
                            parseFloat(vehicleData["stops"][previousStopIndex +1]["lon"])
                        )(delta);

                        var projection = __model.getMapModel().project(lat, lon);


                        var bufferIndex = _vehiclesBufferMapping[tripId].bufferIndex;


                        for(var j = 0; j < _circlesNumber; j++) {
                            position[bufferIndex + (j * 3)] = projection.x;
                            position[bufferIndex + (j * 3) +1] = projection.y;
                            position[bufferIndex + (j * 3) +2] = 1;

                            if(opacity[bufferIndex + j] >= _circlesOpacities.max) {
                                _vehiclesBufferMapping[tripId].delta = -_animationIncrement;
                            } else if(opacity[bufferIndex + j] <= _circlesOpacities.min) {
                                _vehiclesBufferMapping[tripId].delta = _animationIncrement;
                            }

                            opacity[bufferIndex + j] += _vehiclesBufferMapping[tripId].delta;

                            size[j] = _vehicleSizes.max;
                                /*
                                (_circlesOpacities.max - opacity[bufferIndex + j]) *
                                (_vehicleSizes.max - _vehicleSizes.min)
                                + _vehicleSizes.min;*/
                        }
                    }
                }
            }

            _geometryBuffer.attributes.position.needsUpdate = true;
            _geometryBuffer.attributes.size.needsUpdate = true;
            _geometryBuffer.attributes.customColor.needsUpdate = true;
            _geometryBuffer.attributes.vertexOpacity.needsUpdate = true;
        } else if(_needUpdate) {
            _allTrips = __model.getCTAModel().getTrips();
            updateAnimation();
            _needUpdate = false;
        }
    };

    this.dataUpdated = function() {
        _needUpdate = true;
    };

    /*------------------ PRIVATE METHODS -----------------*/
    var updateAnimation = function() {
        _trips = {};
        for(var tripId in _allTrips) {
            if(parseInt(_allTrips[tripId]["hop"]) == 0) {
                _trips[tripId] = _allTrips[tripId];
            }
        }

        // Initialize WebGL variables
        var attributes = {
            size: {	type: 'f', value: [] },
            customColor: { type: 'c', value: [] },
            vertexOpacity: { type: 'f', value: [] }
        };
        var texture = THREE.ImageUtils.loadTexture( "img/circle.png" );
        texture.minFilter = THREE.LinearFilter;
        var uniforms = {
            texture:   { type: "t", value: /*THREE.ImageUtils.loadTexture( "img/circle.png" )*/texture }
        };

        var shaderMaterial = new THREE.ShaderMaterial( {
            uniforms:       uniforms,
            attributes:     attributes,
            vertexShader:   document.getElementById( 'vertexshader' ).textContent,
            fragmentShader: document.getElementById( 'fragmentshader' ).textContent,

            //blending:       THREE.AdditiveBlending,
            depthTest:      false,
            transparent:    true,
            sizeAttenuation: false,
            vertexColors: THREE.VertexColors
        });

        var trips = d3.values(_trips);
        // Handling vehicles positions
        _geometryBuffer = new THREE.BufferGeometry();
        var buffer = new Float32Array(trips.length * _circlesNumber * 3);
        _geometryBuffer.addAttribute('position', new THREE.BufferAttribute(buffer, 3));
        buffer = new Float32Array(trips.length * _circlesNumber * 3);
        _geometryBuffer.addAttribute('customColor', new THREE.BufferAttribute(buffer, 3));
        buffer = new Float32Array(trips.length * _circlesNumber);
        _geometryBuffer.addAttribute('size', new THREE.BufferAttribute(buffer, 1));
        buffer = new Float32Array(trips.length * _circlesNumber);
        _geometryBuffer.addAttribute('vertexOpacity', new THREE.BufferAttribute(buffer, 1));

        if(_mesh != null) {
            self.getScene().remove(_mesh);
        }
        _mesh = new THREE.PointCloud( _geometryBuffer, shaderMaterial );
        self.getScene().add(_mesh);

        var size = _geometryBuffer.attributes.size.array;
        var color = _geometryBuffer.attributes.customColor.array;
        var opacity = _geometryBuffer.attributes.vertexOpacity.array;

        var tColor = new THREE.Color();
        tColor.setStyle("#3182bd");

        for(var i = 0; i < trips.length; i++) {
            for(var j = 0; j < _circlesNumber; j++) {
                size[i + j] = 0;
                opacity[i + j] =
                    (((_circlesOpacities.max - _circlesOpacities.min) / _circlesNumber) * j) + _circlesOpacities.min;

                color[i + (j * 3)] = tColor.r;
                color[i + (j * 3) +1] = tColor.g;
                color[i + (j * 3) +2] = tColor.b;
            }
        }


        i = 0;
        _vehiclesBufferMapping = {};
        for(var tripId in _trips) {
            _vehiclesBufferMapping[tripId] = {
                bufferIndex: i,
                delta: _animationIncrement
            };
            i += _circlesNumber;
        }
    };

    var getLastStopIndex = function(time, stops) {
        var s = 0;
        var stopTimeInSeconds;

        while(s < stops.length) {
            stopTimeInSeconds =
                Utils.toSeconds(
                    stops[s]["arrivalTime"]["hh"],
                    stops[s]["arrivalTime"]["mm"],
                    stops[s]["arrivalTime"]["ss"]
                );
            if(time < stopTimeInSeconds) {
                return s -1;
            }
            s++;
        }

        return -1;
    };

    var init = function () {
        __notificationCenter.subscribe(self, self.dataUpdated, Notifications.CTA.TRIPS_UPDATED);
    }();
}

Utils.extend(VehiclesPositionSceneController, SceneController);