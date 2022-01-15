import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

export class RoomManager {
  #camera;
  #scene;
  #renderer;
  #controller1;
  #controller2;
  #controllerGrip1
  #controllerGrip2;

  #wasPresenting;
  #user
  #phys_objs;
  #phys_obj_bodies;

  #lastCallTime;
  #temp_vec3;
  #temp_quat;
  #temp_displacement;
  #temp_velocity;
  #tempMatrix;
  #timeStep;
  #world;

  #cameraVector;
  #prevGamePads;
  #speedFactor;

  #intersected;

  #raycaster;

  #oControls;
  #container;
  constructor(container, windowInnerWidth, windowInnerHeight) {
    this.#container = container;
    this.#phys_obj_bodies = {};
    this.#temp_vec3 = new THREE.Vector3()
    this.#temp_quat = new THREE.Quaternion();
    this.#temp_displacement = new THREE.Vector3();
    this.#temp_velocity = new THREE.Vector3();
    this.#tempMatrix = new THREE.Matrix4();

    this.#lastCallTime = 0;

    this.#timeStep = 1/60;
    this.#world = new CANNON.World(
      {gravity: new CANNON.Vec3(0, -9.82, 0)}
    );

    this.#cameraVector = new THREE.Vector3(); // create once and reuse it!
    this.#prevGamePads = new Map();
    this.#speedFactor = [0.1, 0.1, 0.1, 0.1];

    this.#intersected = [];

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(75, windowInnerWidth / windowInnerHeight, 0.1, 10);


    this.#renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.#renderer.setSize(window.innerWidth, window.innerHeight);
    this.#renderer.outputEncoding = THREE.sRGBEncoding;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.xr.enabled = true;
    this.#renderer.setPixelRatio( window.devicePixelRatio );


  }

  getRenderer() {
    return this.#renderer;
  }

  #addPhysObject(body, mesh, name, position) {
    this.#phys_obj_bodies[name] = body;
    body.position.set(...position); // m
    this.#world.addBody(body);

    mesh.userData.name = name;
    mesh.position.set(...position); // m
    this.#scene.add(mesh);

    this.#phys_objs.add(mesh);

  }

  init() {

    const scene = this.#scene;

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    })
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // make it face up
    groundBody.position.set(0,-1.325,0);
    this.#world.addBody(groundBody)

    this.#phys_objs = new THREE.Group();
    scene.add( this.#phys_objs );

    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.scale.set(0.1, 0.1, 0.1);
    const size = 0.05;
    const halfExtents = new CANNON.Vec3(size, size, size)
    const boxShape = new CANNON.Box(halfExtents)
    const boxBody = new CANNON.Body({ mass: 1, shape: boxShape })
    this.#addPhysObject(boxBody, boxMesh, "box", [-1,0,1]);

    const cvtp1_geometry = new THREE.SphereGeometry( 0.01);
    const cvtpm_material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const controllerVelocityTrackingPoint1 = new THREE.Mesh(cvtp1_geometry, cvtpm_material);
    controllerVelocityTrackingPoint1.position.set(0, 0.05, 0);
    controllerVelocityTrackingPoint1.userData.previousWorldPosition = new THREE.Vector3(0, 0.05, 0);
    controllerVelocityTrackingPoint1.userData.name = "velocityTrackingPoint";

    const sphereBody = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(0.1),
    })
    const geo = new THREE.SphereGeometry(0.1)
    const mat= new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(geo, mat)
    this.#addPhysObject(sphereBody, sphereMesh, 'sphere', [0,1,1.2]);

  // controllers

    this.#controller1 = this.#renderer.xr.getController( 0 );
    this.#controller1.add( controllerVelocityTrackingPoint1 );
    this.#controller1.userData.throwVelocities = Array.from({length: 10}, (v, i) => new THREE.Vector3(0, 0, 0));
    this.#controller1.addEventListener( 'selectstart', (e) => this.#onSelectStart(e) );
    this.#controller1.addEventListener( 'selectend', (e) => this.#onSelectEnd(e) );
    scene.add( this.#controller1 );

    this.#controller2 = this.#renderer.xr.getController( 1 );
    this.#controller2.addEventListener( 'selectstart', (e) => this.#onSelectStart(e) );
    this.#controller2.addEventListener( 'selectend', (e) => this.#onSelectEnd(e) );
    scene.add( this.#controller2 );

    const controllerModelFactory = new XRControllerModelFactory();

    this.#controllerGrip1 = this.#renderer.xr.getControllerGrip( 0 );
    this.#controllerGrip1.add( controllerModelFactory.createControllerModel( this.#controllerGrip1 ) );
    scene.add( this.#controllerGrip1 );

    this.#controllerGrip2 = this.#renderer.xr.getControllerGrip( 1 );
    this.#controllerGrip2.add( controllerModelFactory.createControllerModel( this.#controllerGrip2 ) );
    scene.add( this.#controllerGrip2 );

    this.#user = new THREE.Group();
    //user.rotateY(180);
    this.#user.position.set(0,0,3);
    this.#user.name = 'user';
    this.#user.add(this.#camera);
    this.#user.add(this.#controller1);
    this.#user.add(this.#controller2);
    this.#user.add(this.#controllerGrip1);
    this.#user.add(this.#controllerGrip2);
    scene.add(this.#user);

    this.#wasPresenting = this.#renderer.xr.isPresenting;
    const loader = new GLTFLoader();

    loader.load( 'cliffRoom_03.gltf', function ( gltf ) {

      const model = gltf.scene
      model.scale.set(0.01, 0.01, 0.01);
      model.rotateY(30);
    	scene.add( model );

    }, undefined, function ( error ) {

    	console.error( error );

    } );

    const light = new THREE.PointLight( 0xffffff, 1, 100 );
    light.position.set( 1, 1, 1 );
    scene.add( light );

    this.#oControls = new OrbitControls( this.#camera, this.#container );
    this.#oControls.target.set( 0, 1.6, 0 );
    this.#oControls.update();

    const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

    const line = new THREE.Line( geometry );
    line.name = 'line';
    line.scale.z = 5;

    this.#controller1.add( line.clone() );
    this.#controller2.add( line.clone() );

    this.#raycaster = new THREE.Raycaster();

    //

  }

  onWindowResize() {

    this.#camera.aspect = window.innerWidth / window.innerHeight;
    this.#camera.updateProjectionMatrix();

    this.#renderer.setSize( window.innerWidth, window.innerHeight );

  }

  #onSelectStart( event ) {

    const controller = event.target;

    const intersections = this.#getIntersections( controller );
    controller.userData.carrying = true;

    if ( intersections.length > 0 ) {


      const intersection = intersections[ 0 ];

      const object = intersection.object;
      //object.material.emissive.b = 1;
      controller.attach( object );

      //console.log( 'attach', object );
      const body = this.#phys_obj_bodies[object.userData.name]
      body.velocity.set(0,0,0);
      body.angularVelocity.set(0,0,0)


      controller.userData.selected = object;

    }

  }

  #onSelectEnd( event ) {

    const controller = event.target;
    controller.userData.carrying = false;

    if ( controller.userData.selected !== undefined ) {

      const object = controller.userData.selected;
      //object.material.emissive.b = 0;

      const body = this.#phys_obj_bodies[object.userData.name]
      body.position.copy(object.getWorldPosition(this.#temp_vec3));
      body.quaternion.copy(object.getWorldQuaternion(this.#temp_quat));
      body.velocity.copy(this.#getControllerThrowVelocity(controller));

      this.#phys_objs.attach( object );

      controller.userData.selected = undefined;

    }


  }

  #getIntersections( controller ) {

    this.#tempMatrix.identity().extractRotation( controller.matrixWorld );

    this.#raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
    this.#raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( this.#tempMatrix );

    return this.#raycaster.intersectObjects( this.#phys_objs.children, false );

  }

  #intersectObjects( controller ) {

    // Do not highlight when already selected

    if ( controller.userData.selected !== undefined ) return;

    const line = controller.getObjectByName( 'line' );
    const intersections = this.#getIntersections( controller );

    if ( intersections.length > 0 ) {

      const intersection = intersections[ 0 ];

      const session = this.#renderer.xr.getSession();
      if (session) {  //only if we are in a webXR session
          for (const sourceXR of session.inputSources) {

              if (!sourceXR.gamepad) continue;
              if (
                  sourceXR &&
                  sourceXR.gamepad &&
                  sourceXR.gamepad.hapticActuators &&
                  sourceXR.gamepad.hapticActuators[0] &&
                  sourceXR.handedness == controller.name              
              ) {
                  var didPulse = sourceXR.gamepad.hapticActuators[0].pulse(0.8, 100);
              }
          }
      }

      const object = intersection.object;
      //object.material.emissive.r = 1;
      this.#intersected.push( object );

      line.scale.z = intersection.distance;

    } else {

      line.scale.z = 5;

    }

  }

  #cleanIntersected() {

    while ( this.#intersected.length ) {

      const object = this.#intersected.pop();
      //object.material.emissive.r = 0;

    }

  }

  #findControllerThrowVelocity(controller, dt) {
    const velocityTrackingPoint = controller.children.find(child => child.userData.name === 'velocityTrackingPoint');
    const worldPosition = velocityTrackingPoint.getWorldPosition(this.#temp_vec3);
    const previousWorldPosition = velocityTrackingPoint.userData.previousWorldPosition;
    this.#temp_displacement.copy(worldPosition).sub(previousWorldPosition);
    //temp_displacement.length() > 0 ? console.log({worldPosition, previousWorldPosition, temp_displacement}) : null;
    if (dt > 0) {
      this.#temp_velocity.copy(this.#temp_displacement).divideScalar(dt);
    }
    velocityTrackingPoint.userData.previousWorldPosition.copy(worldPosition);

    //temp_displacement.length() > 0 ? console.log({temp_displacement, dt, temp_velocity}) : null;

    return this.#temp_velocity;
  }

  #setControllerThrowVelocity(controller, velocity) {
    const newVelocity = new THREE.Vector3();
    newVelocity.copy(velocity);
    controller.userData.throwVelocities.shift();
    controller.userData.throwVelocities.push(newVelocity);
    //console.log({pushing: velocity, velocities: controller.userData.throwVelocities});
  }

  #getControllerThrowVelocity(controller) {
    const avgThrowVelocity = new THREE.Vector3();
    const throwVelocities = controller.userData.throwVelocities;
    //console.log(throwVelocities);
    const length = throwVelocities.length;

    let maxPosition = 0;
    let maxValue = 0;
    for(var i = 0; i < length; i++) {
      const value = throwVelocities[i].length()
      if (value > maxValue) {
        maxPosition = i;
        maxValue = value;
      }
    }

    let div = 1;
    avgThrowVelocity.copy(throwVelocities[maxPosition]);
    if (maxPosition > 0) {
      avgThrowVelocity.add(throwVelocities[maxPosition - 1]);
      div += 1;
    }
    if (maxPosition < length -1) {
      avgThrowVelocity.add(throwVelocities[maxPosition + 1])
      div += 1;
    }

    avgThrowVelocity.divideScalar(div);

    //console.log({maxPosition, avgThrowVelocity, throwVelocities});

    return avgThrowVelocity;
  }

  #update() {

    const time = performance.now() / 1000 // seconds
    let dt = 0;
    dt = time - this.#lastCallTime
    this.#world.step(this.#timeStep, dt)

    this.#lastCallTime = time

    if (this.#controller1.userData.carrying){
      //console.log("carrying");
      const controller1ThrowVelocity = this.#findControllerThrowVelocity(this.#controller1, dt);
      this.#setControllerThrowVelocity(this.#controller1, controller1ThrowVelocity);
    } else {
      //console.log("not carrying");
    }


    //controller1.userData.throwVelocity.length() > 2 ? console.log(controller1.userData.throwVelocity) : null;

    const controller1 = this.#controller1;
    const controller2 = this.#controller2;
    const phys_obj_bodies = this.#phys_obj_bodies;

    this.#phys_objs.children.forEach(function(mesh) {
      if(controller1.userData.selected != mesh && controller2.userData.selected != mesh)
      {
        const body = phys_obj_bodies[mesh.userData.name]
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      }
    });


    this.#cleanIntersected();

    this.#intersectObjects( this.#controller1 );
    this.#intersectObjects( this.#controller2 );

    //add gamepad polling for webxr to renderloop
    this.#userMove()

    if (this.#renderer.xr.isPresenting && !this.#wasPresenting) {
      this.#user.position.set(0,-1,3);
      this.#wasPresenting = true;
    }

    this.#renderer.render( this.#scene, this.#camera );

  }

  #userMove() {
    var handedness = "unknown";

    //determine if we are in an xr session
    const session = this.#renderer.xr.getSession();
    let i = 0;

    if (session) {
        let xrCamera = this.#renderer.xr.getCamera(this.#camera);
        xrCamera.getWorldDirection(this.#cameraVector);

        //a check to prevent console errors if only one input source
        if (this.#isIterable(session.inputSources)) {
            for (const source of session.inputSources) {
                if (source && source.handedness) {
                    handedness = source.handedness; //left or right controllers
                }
                if (!source.gamepad) continue;
                const controller = this.#renderer.xr.getController(i++);
                const old = this.#prevGamePads.get(source);
                const data = {
                    handedness: handedness,
                    buttons: source.gamepad.buttons.map((b) => b.value),
                    axes: source.gamepad.axes.slice(0)
                };
                if (old) {
                    data.buttons.forEach((value, i) => {
                        //handlers for buttons
                        if (value !== old.buttons[i] || Math.abs(value) > 0.8) {
                            //check if it is 'all the way pushed'
                            if (value === 1) {
                                //console.log("Button" + i + "Down");
                                if (data.handedness == "left") {
                                    //console.log("Left Paddle Down");
                                    if (i == 1) {
                                        this.#user.rotateY(-THREE.MathUtils.degToRad(1));
                                    }
                                    if (i == 3) {
                                        //reset teleport to home position
                                        this.#user.position.x = 0;
                                        this.#user.position.y = 5;
                                        this.#user.position.z = 0;
                                    }
                                } else {
                                    //console.log("Right Paddle Down");
                                    if (i == 1) {
                                        this.#user.rotateY(THREE.MathUtils.degToRad(1));
                                    }
                                }
                            } else {
                                // console.log("Button" + i + "Up");

                                if (i == 1) {
                                    //use the paddle buttons to rotate
                                    if (data.handedness == "left") {
                                        //console.log("Left Paddle Down");
                                        this.#user.rotateY(-THREE.MathUtils.degToRad(Math.abs(value)));
                                    } else {
                                        //console.log("Right Paddle Down");
                                        this.#user.rotateY(THREE.MathUtils.degToRad(Math.abs(value)));
                                    }
                                }
                            }
                        }
                    });
                    data.axes.forEach((value, i) => {
                        //handlers for thumbsticks
                        //if thumbstick axis has moved beyond the minimum threshold from center, windows mixed reality seems to wander up to about .17 with no input
                        if (Math.abs(value) > 0.2) {
                            //set the speedFactor per axis, with acceleration when holding above threshold, up to a max speed
                            this.#speedFactor[i] > 1 ? (this.#speedFactor[i] = 1) : (this.#speedFactor[i] *= 1.001);
                            //console.log(value, speedFactor[i], i);
                            if (i == 2) {
                                //left and right axis on thumbsticks
                                if (data.handedness == "right") {
                                    // (data.axes[2] > 0) ? console.log('left on left thumbstick') : console.log('right on left thumbstick')

                                    //move our user
                                    //we reverse the vectors 90degrees so we can do straffing side to side movement
                                    this.#user.position.x -= this.#cameraVector.z * this.#speedFactor[i] * data.axes[2];
                                    this.#user.position.z += this.#cameraVector.x * this.#speedFactor[i] * data.axes[2];

                                    //provide haptic feedback if available in browser
                                    //if (
                                    //    source.gamepad.hapticActuators &&
                                    //    source.gamepad.hapticActuators[0]
                                    //) {
                                    //    var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
                                    //    if (pulseStrength > 0.75) {
                                    //        pulseStrength = 0.75;
                                    //    }

                                    //    var didPulse = source.gamepad.hapticActuators[0].pulse(
                                    //        pulseStrength,
                                    //        100
                                    //    );
                                    //}
                                } else {
                                    // (data.axes[2] > 0) ? console.log('left on right thumbstick') : console.log('right on right thumbstick')
                                    this.#user.rotateY(-THREE.MathUtils.degToRad(data.axes[2]));
                                }
                                this.#oControls.update();
                            }

                            if (i == 3) {
                                //up and down axis on thumbsticks
                                if (data.handedness == "left") {
                                    // (data.axes[3] > 0) ? console.log('up on left thumbstick') : console.log('down on left thumbstick')
                                    //user.position.y -= speedFactor[i] * data.axes[3];
                                    ////provide haptic feedback if available in browser
                                    //if (
                                    //    source.gamepad.hapticActuators &&
                                    //    source.gamepad.hapticActuators[0]
                                    //) {
                                    //    var pulseStrength = Math.abs(data.axes[3]);
                                    //    if (pulseStrength > 0.75) {
                                    //        pulseStrength = 0.75;
                                    //    }
                                    //    var didPulse = source.gamepad.hapticActuators[0].pulse(
                                    //        pulseStrength,
                                    //        100
                                    //    );
                                    //}
                                } else {
                                    // (data.axes[3] > 0) ? console.log('up on right thumbstick') : console.log('down on right thumbstick')
                                    this.#user.position.x -= this.#cameraVector.x * this.#speedFactor[i] * data.axes[3];
                                    this.#user.position.z -= this.#cameraVector.z * this.#speedFactor[i] * data.axes[3];

                                    //provide haptic feedback if available in browser
                                    //if (
                                    //    source.gamepad.hapticActuators &&
                                    //    source.gamepad.hapticActuators[0]
                                    //) {
                                    //    var pulseStrength = Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
                                    //    if (pulseStrength > 0.75) {
                                    //        pulseStrength = 0.75;
                                    //    }
                                    //    var didPulse = source.gamepad.hapticActuators[0].pulse(
                                    //        pulseStrength,
                                    //        100
                                    //    );
                                    //}
                                }
                                this.#oControls.update();
                            }
                        } else {
                            //axis below threshold - reset the speedFactor if it is greater than zero  or 0.025 but below our threshold
                            if (Math.abs(value) > 0.025) {
                                this.#speedFactor[i] = 0.025;
                            }
                        }
                    });
                }
                ///store this frames data to compate with in the next frame
                this.#prevGamePads.set(source, data);
            }
        }
    }
  }

  #isIterable(obj) {  //function to check if object is iterable
    // checks for null and undefined
    if (obj == null) {
        return false;
    }
    return typeof obj[Symbol.iterator] === "function";
  }

  animate() {
    this.#lastCallTime = performance.now() / 1000;
    this.#renderer.setAnimationLoop( () => {
      this.#update();
    } );
  }

}