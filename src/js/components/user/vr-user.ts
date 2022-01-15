import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export class VRUser {
  #controller1;
  #controller2;
  #controllerGrip1
  #controllerGrip2;
  #dolly;
  #camera;
  #cameraVector;
  #prevGamePads;
  #speedFactor;
  #intersected;
  #raycaster;
  #physicalObjectManager;
  #oControls;
  #renderer;
  #temp_quat;
  #tempMatrix;
  #temp_vec3;
  #temp_displacement;
  #temp_velocity;

  constructor({renderer, camera, container, physicalObjectManager}) {
    this.#renderer = renderer;
    this.#camera = camera;
    this.#physicalObjectManager = physicalObjectManager;
    this.#cameraVector = new THREE.Vector3();
    this.#prevGamePads = new Map();
    this.#speedFactor = [0.1, 0.1, 0.1, 0.1];
    this.#intersected = [];

    //reusable temp variables
    this.#temp_quat = new THREE.Quaternion();
    this.#tempMatrix = new THREE.Matrix4();
    this.#temp_vec3 = new THREE.Vector3()
    this.#temp_displacement = new THREE.Vector3();
    this.#temp_velocity = new THREE.Vector3();

  // controllers, their velocity tracking, raycasters, and meshes
    const cvtp_geometry = new THREE.SphereGeometry( 0.01);
    const cvtpm_material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const controllerVelocityTrackingPoint1 = new THREE.Mesh(cvtp_geometry, cvtpm_material);
    controllerVelocityTrackingPoint1.position.set(0, 0.05, 0);
    controllerVelocityTrackingPoint1.userData.previousWorldPosition = new THREE.Vector3(0, 0.05, 0);
    controllerVelocityTrackingPoint1.userData.name = "velocityTrackingPoint";

    this.#controller1 = this.#renderer.xr.getController( 0 );
    this.#controller1.add( controllerVelocityTrackingPoint1 );
    this.#controller1.userData.throwVelocities = Array.from({length: 10}, () => new THREE.Vector3(0, 0, 0));
    this.#controller1.addEventListener( 'selectstart', (e) => this.#onSelectStart(e) );
    this.#controller1.addEventListener( 'selectend', (e) => this.#onSelectEnd(e) );

    const controllerVelocityTrackingPoint2 = new THREE.Mesh(cvtp_geometry, cvtpm_material);
    controllerVelocityTrackingPoint2.position.set(0, 0.05, 0);
    controllerVelocityTrackingPoint2.userData.previousWorldPosition = new THREE.Vector3(0, 0.05, 0);
    controllerVelocityTrackingPoint2.userData.name = "velocityTrackingPoint";

    this.#controller2 = this.#renderer.xr.getController( 1 );
    this.#controller2.add( controllerVelocityTrackingPoint2 );
    this.#controller2.userData.throwVelocities = Array.from({length: 10}, () => new THREE.Vector3(0, 0, 0));
    this.#controller2.addEventListener( 'selectstart', (e) => this.#onSelectStart(e) );
    this.#controller2.addEventListener( 'selectend', (e) => this.#onSelectEnd(e) );

    const controllerModelFactory = new XRControllerModelFactory();

    this.#controllerGrip1 = this.#renderer.xr.getControllerGrip( 0 );
    this.#controllerGrip1.add( controllerModelFactory.createControllerModel( this.#controllerGrip1 ) );

    this.#controllerGrip2 = this.#renderer.xr.getControllerGrip( 1 );
    this.#controllerGrip2.add( controllerModelFactory.createControllerModel( this.#controllerGrip2 ) );

    this.#oControls = new OrbitControls( this.#camera, container );
    this.#oControls.target.set( 0, 1.6, 0 );
    this.#oControls.update();

    const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );
    const line = new THREE.Line( geometry );
    line.name = 'line';
    line.scale.z = 5;

    this.#controller1.add( line.clone() );
    this.#controller2.add( line.clone() );

    this.#raycaster = new THREE.Raycaster();

    this.#dolly = new THREE.Group();
    this.#dolly.position.set(0,0,3);
    this.#dolly.name = 'user';
    this.#dolly.add(this.#camera);
    this.#dolly.add(this.#controller1);
    this.#dolly.add(this.#controller2);
    this.#dolly.add(this.#controllerGrip1);
    this.#dolly.add(this.#controllerGrip2);
  }

  setPosition(x, y, z) {
    this.#dolly.position.set(x, y, z);
  }

  getDolly() {
    return this.#dolly;
  }

  update(dt) {
    const controller1 = this.#controller1;
    const controller2 = this.#controller2;

    // update velocity tracking points
    if (controller1.userData.carrying){
      //console.log("carrying");
      const controller1ThrowVelocity = this.#findControllerThrowVelocity(controller1, dt);
      this.#setControllerThrowVelocity(controller1, controller1ThrowVelocity);
    } else if (controller2.userData.carrying){
      //console.log("carrying");
      const controller2ThrowVelocity = this.#findControllerThrowVelocity(controller2, dt);
      this.#setControllerThrowVelocity(controller2, controller2ThrowVelocity);
    }
    //controller1.userData.throwVelocity.length() > 2 ? console.log(controller1.userData.throwVelocity) : null;

    //sync object mesh position with physics bodies when not held by a controller
    const phys_obj_bodies = this.#physicalObjectManager.getPhysObjects().bodies;
    this.#physicalObjectManager.getPhysObjects().meshes.children.forEach(function(mesh) {
      const body = phys_obj_bodies[mesh.userData.name]
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });

    //check for intersections with controller rays
    this.#cleanIntersected();
    this.#intersectObjects( this.#controller1 );
    this.#intersectObjects( this.#controller2 );

    //add gamepad polling for webxr to renderloop
    this.#userMove()
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
      const body = this.#physicalObjectManager.getPhysObjects().bodies[object.userData.name]
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
      const body = this.#physicalObjectManager.getPhysObjects().bodies[object.userData.name]
      body.position.copy(object.getWorldPosition(this.#temp_vec3));
      body.quaternion.copy(object.getWorldQuaternion(this.#temp_quat));
      body.velocity.copy(this.#getControllerThrowVelocity(controller));
      this.#physicalObjectManager.getPhysObjects().meshes.attach( object );
      controller.userData.selected = undefined;
    }
  }

  #getIntersections( controller ) {
    this.#tempMatrix.identity().extractRotation( controller.matrixWorld );
    this.#raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
    this.#raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( this.#tempMatrix );
    return this.#raycaster.intersectObjects( this.#physicalObjectManager.getPhysObjects().meshes.children, false );
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
                  sourceXR.gamepad.hapticActuators[0].pulse(0.8, 100);
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
    //while ( this.#intersected.length ) {
    //  const object = this.#intersected.pop();
    //  //object.material.emissive.r = 0;
    //}
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
    for(let i = 0; i < length; i++) {
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

  #userMove() {
    let handedness = "unknown";

    //determine if we are in an xr session
    const session = this.#renderer.xr.getSession();

    if (session) {
        const xrCamera = this.#renderer.xr.getCamera(this.#camera);
        xrCamera.getWorldDirection(this.#cameraVector);

        //a check to prevent console errors if only one input source
        if (this.#isIterable(session.inputSources)) {
            for (const source of session.inputSources) {
                if (source && source.handedness) {
                    handedness = source.handedness; //left or right controllers
                }
                if (!source.gamepad) continue;
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
                                        this.#dolly.rotateY(-THREE.MathUtils.degToRad(1));
                                    }
                                    if (i == 3) {
                                        //reset teleport to home position
                                        this.#dolly.position.x = 0;
                                        this.#dolly.position.y = 5;
                                        this.#dolly.position.z = 0;
                                    }
                                } else {
                                    //console.log("Right Paddle Down");
                                    if (i == 1) {
                                        this.#dolly.rotateY(THREE.MathUtils.degToRad(1));
                                    }
                                }
                            } else {
                                // console.log("Button" + i + "Up");

                                if (i == 1) {
                                    //use the paddle buttons to rotate
                                    if (data.handedness == "left") {
                                        //console.log("Left Paddle Down");
                                        this.#dolly.rotateY(-THREE.MathUtils.degToRad(Math.abs(value)));
                                    } else {
                                        //console.log("Right Paddle Down");
                                        this.#dolly.rotateY(THREE.MathUtils.degToRad(Math.abs(value)));
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
                                    this.#dolly.position.x -= this.#cameraVector.z * this.#speedFactor[i] * data.axes[2];
                                    this.#dolly.position.z += this.#cameraVector.x * this.#speedFactor[i] * data.axes[2];
                                } else {
                                    // (data.axes[2] > 0) ? console.log('left on right thumbstick') : console.log('right on right thumbstick')
                                    this.#dolly.rotateY(-THREE.MathUtils.degToRad(data.axes[2]));
                                }
                                this.#oControls.update();
                            }

                            if (i == 3) {
                                //up and down axis on thumbsticks
                                if (data.handedness == "left") {
                                    // (data.axes[3] > 0) ? console.log('up on left thumbstick') : console.log('down on left thumbstick')
                                    //user.position.y -= speedFactor[i] * data.axes[3];
                                } else {
                                    // (data.axes[3] > 0) ? console.log('up on right thumbstick') : console.log('down on right thumbstick')
                                    this.#dolly.position.x -= this.#cameraVector.x * this.#speedFactor[i] * data.axes[3];
                                    this.#dolly.position.z -= this.#cameraVector.z * this.#speedFactor[i] * data.axes[3];
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
}
