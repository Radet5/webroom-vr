import * as THREE from "three";
import { User } from "./user";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import type { PhysicalObjectsManager } from "../objects-manager/physical-objects-manager";

interface XRUserParams {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  physicalObjectsManager: PhysicalObjectsManager;
}

export interface GrabObjectInterface {
  objectName: string;
  controllerIndex: number;
  objectPosition: THREE.Vector3;
}

export interface releaseObjectInterface {
  objectName: string;
  objectPosition: THREE.Vector3;
  objectQuaternion: any;
  objectVelocity: THREE.Vector3;
  controllerIndex: number;
}

export class VRUser extends User {
  #controller1;
  #controller2;
  #controllerGrip1;
  #controllerGrip2;
  _cameraVector;
  #prevGamePads;
  #speedFactor;
  #intersected: Array<THREE.Object3D>;
  #previousPosition: THREE.Vector3;
  #raycaster;
  #physicalObjectsManager;
  #head;
  #grabObjectCallback: ({
    objectName,
    controllerIndex,
  }: GrabObjectInterface) => void;
  #releaseObjectCallback: ({
    objectName,
    objectPosition,
    objectQuaternion,
    objectVelocity,
  }: releaseObjectInterface) => void;
  #temp_quat;
  #temp_matrix;
  #temp_vec3;
  #temp_vec3_2;
  #temp_displacement;
  #temp_velocity;

  constructor({
    renderer,
    camera,
    container,
    physicalObjectsManager,
  }: XRUserParams) {
    super({ renderer, camera, container });
    this.#physicalObjectsManager = physicalObjectsManager;
    this._cameraVector = new THREE.Vector3();
    this.#prevGamePads = new Map();
    this.#speedFactor = [0.1, 0.1, 0.1, 0.1];
    this.#intersected = [];

    //reusable temp variables so we don't have to create new ones every frame
    this.#temp_quat = new THREE.Quaternion();
    this.#temp_matrix = new THREE.Matrix4();
    this.#temp_vec3 = new THREE.Vector3();
    this.#temp_vec3_2 = new THREE.Vector3();
    this.#temp_displacement = new THREE.Vector3();
    this.#temp_velocity = new THREE.Vector3();

    // controllers, their velocity tracking, raycasters, and meshes
    this.#controller1 = this.#initController(0);
    this.#controller2 = this.#initController(1);
    this.#controllerGrip1 = this.#initControllerGrip(0);
    this.#controllerGrip2 = this.#initControllerGrip(1);

    const headGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    this.#head = new THREE.Mesh(headGeo, headMat);
    this.#head.position.set(0, 1, 0);
    this.#head.visible = false;

    //this.#releaseObjectCallback;

    this.#raycaster = new THREE.Raycaster();

    this.#previousPosition = new THREE.Vector3();

    this._dolly.add(this.#controller1);
    this._dolly.add(this.#controller2);
    this._dolly.add(this.#controllerGrip1);
    this._dolly.add(this.#controllerGrip2);
    this._dolly.add(this.#head);
  }

  getControllerData() {
    return [
      {
        position: this.#controller1.position,
        quaternion: this.#controller1.quaternion,
      },
      {
        position: this.#controller2.position,
        quaternion: this.#controller2.quaternion,
      },
    ];
  }

  getHeadData() {
    this.#temp_quat.setFromRotationMatrix(this._dolly.matrixWorld);
    return {
      position: this.#head.position,
      quaternion: this.#temp_quat,
    };
  }

  getType(): string {
    return "vr-user";
  }

  registerGrabObjectCallback(
    callback: ({ objectName, controllerIndex }: GrabObjectInterface) => void
  ) {
    this.#grabObjectCallback = callback;
  }

  registerReleaseObjectCallback(
    callback: (releaseObjectData: releaseObjectInterface) => void
  ) {
    this.#releaseObjectCallback = callback;
  }

  update(dt: number) {
    const controller1 = this.#controller1;
    const controller2 = this.#controller2;

    // update velocity tracking points
    if (controller1.userData.carrying) {
      //console.log("carrying");
      const controller1ThrowVelocity = this.#findControllerThrowVelocity(
        controller1,
        dt
      );
      this.#setControllerThrowVelocity(controller1, controller1ThrowVelocity);
    } else if (controller2.userData.carrying) {
      //console.log("carrying");
      const controller2ThrowVelocity = this.#findControllerThrowVelocity(
        controller2,
        dt
      );
      this.#setControllerThrowVelocity(controller2, controller2ThrowVelocity);
    }
    //controller1.userData.throwVelocity.length() > 2 ? console.log(controller1.userData.throwVelocity) : null;

    //check for intersections with controller rays
    this.#cleanIntersected();
    this.#intersectObjects(this.#controller1);
    this.#intersectObjects(this.#controller2);

    //add gamepad polling for webxr to renderloop
    this.#userMove();
    if (this.#previousPosition.distanceTo(this._dolly.position) > 0.01) {
      this._moving = true;
    } else {
      this._moving = false;
    }
    this.#previousPosition.copy(this._dolly.position);
  }

  #initController = (controllerIndex: number) => {
    const cvtpGeometry = new THREE.SphereGeometry(0.01);
    const cvtpMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const controllerVelocityTrackingPoint = new THREE.Mesh(
      cvtpGeometry,
      cvtpMaterial
    );
    controllerVelocityTrackingPoint.position.set(0, 0.05, 0);
    controllerVelocityTrackingPoint.userData.previousWorldPosition =
      new THREE.Vector3(0, 0.05, 0);
    controllerVelocityTrackingPoint.userData.name = "velocityTrackingPoint";

    const controller = this._renderer.xr.getController(controllerIndex);
    controller.add(controllerVelocityTrackingPoint);
    controller.userData.throwVelocities = Array.from(
      { length: 10 },
      () => new THREE.Vector3(0, 0, 0)
    );
    controller.addEventListener("selectstart", (e) => this.#onSelectStart(e));
    controller.addEventListener("selectend", (e) => this.#onSelectEnd(e));

    controller.userData.index = controllerIndex;

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(geometry);
    line.name = "line";
    line.scale.z = 5;
    controller.add(line.clone());

    return controller;
  };

  #initControllerGrip = (controllerIndex: number) => {
    const controllerModelFactory = new XRControllerModelFactory();
    const controllerGrip = this._renderer.xr.getControllerGrip(controllerIndex);
    controllerGrip.add(
      controllerModelFactory.createControllerModel(controllerGrip)
    );
    return controllerGrip;
  };

  #onSelectStart(event: THREE.Event) {
    const controller = event.target;
    const intersections = this.#getIntersections(controller);
    controller.userData.carrying = true;
    console.log(controller);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      const object = intersection.object;
      controller.attach(object);
      if (typeof this.#grabObjectCallback === "function") {
        this.#grabObjectCallback({
          objectName: object.userData.name,
          controllerIndex: controller.userData.index,
          objectPosition: object.getWorldPosition(this.#temp_vec3),
        });
      }
      //console.log( 'attach', object );
      this.#physicalObjectsManager.setObjectVelocity(object.userData.name, {
        x: 0,
        y: 0,
        z: 0,
      });
      this.#physicalObjectsManager.setObjectAngularVelocity(
        object.userData.name,
        { x: 0, y: 0, z: 0 }
      );
      controller.userData.selected = object;
    }
  }

  #onSelectEnd(event: THREE.Event) {
    const controller = event.target;
    controller.userData.carrying = false;

    if (controller.userData.selected !== undefined) {
      const object = controller.userData.selected;
      //object.material.emissive.b = 0;
      object.getWorldPosition(this.#temp_vec3);
      object.getWorldQuaternion(this.#temp_quat);
      const throwVeloctiy = this.#getControllerThrowVelocity(controller);

      this.#physicalObjectsManager.setObjectWorldPosition(
        object.userData.name,
        this.#temp_vec3
      );
      this.#physicalObjectsManager.setObjectWorldQuaternion(
        object.userData.name,
        this.#temp_quat
      );
      this.#physicalObjectsManager.setObjectVelocity(object.userData.name, {
        x: throwVeloctiy.x,
        y: throwVeloctiy.y,
        z: throwVeloctiy.z,
      });
      this.#physicalObjectsManager.reAttachObjectMesh(object);
      if (typeof this.#releaseObjectCallback === "function") {
        this.#releaseObjectCallback({
          objectName: object.userData.name,
          objectPosition: this.#temp_vec3,
          objectQuaternion: this.#temp_quat,
          objectVelocity: throwVeloctiy,
          controllerIndex: controller.userData.index,
        });
      }
      controller.userData.selected = undefined;
    }
  }

  #getIntersections(controller: THREE.Group) {
    this.#temp_matrix.identity().extractRotation(controller.matrixWorld);
    this.#raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.#raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.#temp_matrix);
    return this.#raycaster.intersectObjects(
      this.#physicalObjectsManager.getPhysObjectsMeshes().children,
      false
    );
  }

  #intersectObjects(controller: THREE.Group) {
    // Do not highlight when already selected
    if (controller.userData.selected !== undefined) return;

    const line = controller.getObjectByName("line");
    if (line === undefined) {
      console.error("Controller is missing ray.");
      return;
    }

    const intersections = this.#getIntersections(controller);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      // This should make the controllers vibrate but it doesn't
      //const session = this._renderer.xr.getSession();
      //if (session) {  //only if we are in a webXR session
      //    for (const sourceXR of session.inputSources) {
      //        if (!sourceXR.gamepad) continue;
      //        if (
      //            sourceXR &&
      //            sourceXR.gamepad &&
      //            sourceXR.gamepad.hapticActuators &&
      //            sourceXR.gamepad.hapticActuators[0] &&
      //            sourceXR.handedness == controller.name
      //        ) {
      //            sourceXR.gamepad.hapticActuators[0].pulse(0.8, 100);
      //        }
      //    }
      //}

      const object = intersection.object;
      //object.material.emissive.r = 1;
      this.#intersected.push(object);
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

  #findControllerThrowVelocity(controller: THREE.Group, dt: number) {
    const velocityTrackingPoint = controller.children.find(
      (child) => child.userData.name === "velocityTrackingPoint"
    );
    if (velocityTrackingPoint === undefined) {
      console.error("Controller is missing velocity tracking point.");
      this.#temp_velocity.set(0, 0, 0);
      return this.#temp_velocity;
    }

    const worldPosition = velocityTrackingPoint.getWorldPosition(
      this.#temp_vec3
    );
    const previousWorldPosition =
      velocityTrackingPoint.userData.previousWorldPosition;
    this.#temp_displacement.copy(worldPosition).sub(previousWorldPosition);
    //temp_displacement.length() > 0 ? console.log({worldPosition, previousWorldPosition, temp_displacement}) : null;
    if (dt > 0) {
      this.#temp_velocity.copy(this.#temp_displacement).divideScalar(dt);
    }
    velocityTrackingPoint.userData.previousWorldPosition.copy(worldPosition);
    //temp_displacement.length() > 0 ? console.log({temp_displacement, dt, temp_velocity}) : null;
    return this.#temp_velocity;
  }

  #setControllerThrowVelocity(
    controller: THREE.Group,
    velocity: THREE.Vector3
  ) {
    const newVelocity = new THREE.Vector3();
    newVelocity.copy(velocity);
    controller.userData.throwVelocities.shift();
    controller.userData.throwVelocities.push(newVelocity);
    //console.log({pushing: velocity, velocities: controller.userData.throwVelocities});
  }

  #getControllerThrowVelocity(controller: THREE.Group) {
    const avgThrowVelocity = this.#temp_vec3_2;
    const throwVelocities = controller.userData.throwVelocities;
    //console.log(throwVelocities);
    const length = throwVelocities.length;
    let maxPosition = 0;
    let maxValue = 0;
    for (let i = 0; i < length; i++) {
      const value = throwVelocities[i].length();
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
    if (maxPosition < length - 1) {
      avgThrowVelocity.add(throwVelocities[maxPosition + 1]);
      div += 1;
    }

    avgThrowVelocity.divideScalar(div);
    //console.log({maxPosition, avgThrowVelocity, throwVelocities});
    return avgThrowVelocity;
  }

  #userMove() {
    let handedness = "unknown";

    //determine if we are in an xr session
    const session = this._renderer.xr.getSession();

    if (session) {
      const xrCamera = this._renderer.xr.getCamera(this._camera);
      xrCamera.getWorldDirection(this._cameraVector);

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
            axes: source.gamepad.axes.slice(0),
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
                      this._dolly.rotateY(-THREE.MathUtils.degToRad(1));
                    }
                    if (i == 3) {
                      //reset teleport to home position
                      this._dolly.position.x = 0;
                      this._dolly.position.y = 5;
                      this._dolly.position.z = 0;
                    }
                  } else {
                    //console.log("Right Paddle Down");
                    if (i == 1) {
                      this._dolly.rotateY(THREE.MathUtils.degToRad(1));
                    }
                  }
                } else {
                  // console.log("Button" + i + "Up");

                  if (i == 1) {
                    //use the paddle buttons to rotate
                    if (data.handedness == "left") {
                      //console.log("Left Paddle Down");
                      this._dolly.rotateY(
                        -THREE.MathUtils.degToRad(Math.abs(value))
                      );
                    } else {
                      //console.log("Right Paddle Down");
                      this._dolly.rotateY(
                        THREE.MathUtils.degToRad(Math.abs(value))
                      );
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
                this.#speedFactor[i] > 1
                  ? (this.#speedFactor[i] = 1)
                  : (this.#speedFactor[i] *= 1.001);
                //console.log(value, speedFactor[i], i);
                if (i == 2) {
                  //left and right axis on thumbsticks
                  if (data.handedness == "right") {
                    // (data.axes[2] > 0) ? console.log('left on left thumbstick') : console.log('right on left thumbstick')

                    //move our user
                    //we reverse the vectors 90degrees so we can do straffing side to side movement
                    this._dolly.position.x -=
                      this._cameraVector.z *
                      this.#speedFactor[i] *
                      data.axes[2];
                    this._dolly.position.z +=
                      this._cameraVector.x *
                      this.#speedFactor[i] *
                      data.axes[2];
                  } else {
                    // (data.axes[2] > 0) ? console.log('left on right thumbstick') : console.log('right on right thumbstick')
                    this._dolly.rotateY(
                      -THREE.MathUtils.degToRad(data.axes[2])
                    );
                  }
                }

                if (i == 3) {
                  //up and down axis on thumbsticks
                  if (data.handedness == "left") {
                    // (data.axes[3] > 0) ? console.log('up on left thumbstick') : console.log('down on left thumbstick')
                    //user.position.y -= speedFactor[i] * data.axes[3];
                  } else {
                    // (data.axes[3] > 0) ? console.log('up on right thumbstick') : console.log('down on right thumbstick')
                    this._dolly.position.x -=
                      this._cameraVector.x *
                      this.#speedFactor[i] *
                      data.axes[3];
                    this._dolly.position.z -=
                      this._cameraVector.z *
                      this.#speedFactor[i] *
                      data.axes[3];
                  }
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

  #isIterable(obj: any) {
    //function to check if object is iterable
    // checks for null and undefined
    if (obj == null) {
      return false;
    }
    return typeof obj[Symbol.iterator] === "function";
  }
}
