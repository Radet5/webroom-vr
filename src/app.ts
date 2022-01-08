import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

let container;
let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let wasPresenting;
let user, phys_objs;

let lastCallTime;
const timeStep = 1/60;

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
  });

let sphereMesh, sphereBody;

let cameraVector = new THREE.Vector3(); // create once and reuse it!
const prevGamePads = new Map();
let speedFactor = [0.1, 0.1, 0.1, 0.1];

const intersected = [];
const tempMatrix = new THREE.Matrix4();

let raycaster;

let controls, oControls;

init();
initCannon();
animate();

function initCannon() {
  const radius = 0.1 // m
  sphereBody = new CANNON.Body({
    mass: 5, // kg
    shape: new CANNON.Sphere(radius),
  })
  sphereBody.position.set(0, 1, 1.2) // m
  world.addBody(sphereBody)
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  })
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // make it face up
  groundBody.position.set(0,-1.325,0);
  world.addBody(groundBody)
}

function init() {

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10);

  phys_objs = new THREE.Group();
  scene.add( phys_objs );

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  renderer.setPixelRatio( window.devicePixelRatio );
  container.appendChild(renderer.domElement);
  document.body.appendChild( VRButton.createButton( renderer ) );

  //const boxgeometry = new THREE.BoxGeometry();
  //const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  //const cube = new THREE.Mesh(boxgeometry, material);
  //cube.scale.set(0.1, 0.1, 0.1);
  //cube.translateZ(1);
  //phys_objs.add(cube);

  const radius = 0.1 // m
  const geo = new THREE.SphereGeometry(radius)
  const mat= new THREE.MeshBasicMaterial({ color: 0xff0000 });
  sphereMesh = new THREE.Mesh(geo, mat)
  sphereMesh.position.set(0, 1, 1.2) // m
  scene.add(sphereMesh)

  sphereMesh.userData.parent = sphereBody;
  phys_objs.add(sphereMesh);

// controllers

  controller1 = renderer.xr.getController( 0 );
  controller1.addEventListener( 'selectstart', onSelectStart );
  controller1.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  controller2.addEventListener( 'selectstart', onSelectStart );
  controller2.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );

  user = new THREE.Group();
  //user.rotateY(180);
  user.position.set(0,0,3);
  user.name = 'user';
  user.add(camera);
  user.add(controller1);
  user.add(controller2);
  user.add(controllerGrip1);
  user.add(controllerGrip2);
  scene.add(user);

  wasPresenting = renderer.xr.isPresenting;
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

  oControls = new OrbitControls( camera, container );
  oControls.target.set( 0, 1.6, 0 );
  oControls.update();

  controls = new PointerLockControls( camera, renderer.domElement );
  document.addEventListener('click', function (){
    controls.lock();
  }, false)
  const onKeyDown = function (event: KeyboardEvent) {
    switch (event.code) {
        case 'KeyW':
            controls.moveForward(0.25)
            break
        case 'KeyA':
            controls.moveRight(-0.25)
            break
        case 'KeyS':
            controls.moveForward(-0.25)
            break
        case 'KeyD':
            controls.moveRight(0.25)
            break
    }
  }
  document.addEventListener('keydown', onKeyDown, false)
  
  const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

  const line = new THREE.Line( geometry );
  line.name = 'line';
  line.scale.z = 5;

  controller1.add( line.clone() );
  controller2.add( line.clone() );

  raycaster = new THREE.Raycaster();

  //

  window.addEventListener( 'resize', onWindowResize );
}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

function onSelectStart( event ) {

  const controller = event.target;

  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const object = intersection.object;
    //object.material.emissive.b = 1;
    controller.attach( object );

    controller.userData.selected = object;

  }

}

function onSelectEnd( event ) {

  const controller = event.target;

  if ( controller.userData.selected !== undefined ) {

    const object = controller.userData.selected;
    //object.material.emissive.b = 0;
    phys_objs.attach( object );

    sphereBody.position.copy(object.position);

    controller.userData.selected = undefined;

  }


}

function getIntersections( controller ) {

  tempMatrix.identity().extractRotation( controller.matrixWorld );

  raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
  raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( tempMatrix );

  return raycaster.intersectObjects( phys_objs.children, false );

}

function intersectObjects( controller ) {

  // Do not highlight when already selected

  if ( controller.userData.selected !== undefined ) return;

  const line = controller.getObjectByName( 'line' );
  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const session = renderer.xr.getSession();
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
    intersected.push( object );

    line.scale.z = intersection.distance;

  } else {

    line.scale.z = 5;

  }

}

function cleanIntersected() {

  while ( intersected.length ) {

    const object = intersected.pop();
    //object.material.emissive.r = 0;

  }

}

function animate() {

  renderer.setAnimationLoop( render );

}

function render() {

  const time = performance.now() / 1000 // seconds
  if (!lastCallTime) {
    world.step(timeStep)
  } else {
    const dt = time - lastCallTime
    world.step(timeStep, dt)
  }
  lastCallTime = time

  if(controller1.userData.selected != sphereMesh && controller2.userData.selected != sphereMesh)
  {
    sphereMesh.position.copy(sphereBody.position);
    sphereMesh.quaternion.copy(sphereBody.quaternion);
    console.log(sphereMesh.position);
  } else {
    //sphereBody.position.copy(sphereMesh.position);
    //sphereBody.quaternion.copy(sphereMesh.quaternion);
    console.log(sphereMesh.position);
  }


  cleanIntersected();

  intersectObjects( controller1 );
  intersectObjects( controller2 );

  //add gamepad polling for webxr to renderloop
  userMove()

  if (renderer.xr.isPresenting && !wasPresenting) {
    user.position.set(0,-1,3);
    wasPresenting = true;
  }

  renderer.render( scene, camera );

}

function userMove() {
  var handedness = "unknown";

  //determine if we are in an xr session
  const session = renderer.xr.getSession();
  let i = 0;

  if (session) {
      let xrCamera = renderer.xr.getCamera(camera);
      xrCamera.getWorldDirection(cameraVector);

      //a check to prevent console errors if only one input source
      if (isIterable(session.inputSources)) {
          for (const source of session.inputSources) {
              if (source && source.handedness) {
                  handedness = source.handedness; //left or right controllers
              }
              if (!source.gamepad) continue;
              const controller = renderer.xr.getController(i++);
              const old = prevGamePads.get(source);
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
                                      user.rotateY(-THREE.MathUtils.degToRad(1));
                                  }
                                  if (i == 3) {
                                      //reset teleport to home position
                                      user.position.x = 0;
                                      user.position.y = 5;
                                      user.position.z = 0;
                                  }
                              } else {
                                  //console.log("Right Paddle Down");
                                  if (i == 1) {
                                      user.rotateY(THREE.MathUtils.degToRad(1));
                                  }
                              }
                          } else {
                              // console.log("Button" + i + "Up");

                              if (i == 1) {
                                  //use the paddle buttons to rotate
                                  if (data.handedness == "left") {
                                      //console.log("Left Paddle Down");
                                      user.rotateY(-THREE.MathUtils.degToRad(Math.abs(value)));
                                  } else {
                                      //console.log("Right Paddle Down");
                                      user.rotateY(THREE.MathUtils.degToRad(Math.abs(value)));
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
                          speedFactor[i] > 1 ? (speedFactor[i] = 1) : (speedFactor[i] *= 1.001);
                          console.log(value, speedFactor[i], i);
                          if (i == 2) {
                              //left and right axis on thumbsticks
                              if (data.handedness == "right") {
                                  // (data.axes[2] > 0) ? console.log('left on left thumbstick') : console.log('right on left thumbstick')

                                  //move our user
                                  //we reverse the vectors 90degrees so we can do straffing side to side movement
                                  user.position.x -= cameraVector.z * speedFactor[i] * data.axes[2];
                                  user.position.z += cameraVector.x * speedFactor[i] * data.axes[2];

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
                                  user.rotateY(-THREE.MathUtils.degToRad(data.axes[2]));
                              }
                              oControls.update();
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
                                  user.position.x -= cameraVector.x * speedFactor[i] * data.axes[3];
                                  user.position.z -= cameraVector.z * speedFactor[i] * data.axes[3];

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
                              oControls.update();
                          }
                      } else {
                          //axis below threshold - reset the speedFactor if it is greater than zero  or 0.025 but below our threshold
                          if (Math.abs(value) > 0.025) {
                              speedFactor[i] = 0.025;
                          }
                      }
                  });
              }
              ///store this frames data to compate with in the next frame
              prevGamePads.set(source, data);
          }
      }
  }
}

function isIterable(obj) {  //function to check if object is iterable
  // checks for null and undefined
  if (obj == null) {
      return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}