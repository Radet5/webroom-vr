import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRUser } from "../user/vr-user";
import { ScreenUser } from "../user/screen-user";
import { PhysicalObjectsManager } from "../objects-manager/physical-objects-manager";
import { ServerDataManager } from "../server-data-manager/server-data-manager";
import { OtherPlayer } from "../agent/other-player";

export class RoomManager {
  #camera;
  #scene;
  #renderer;

  #wasPresenting: boolean;
  #user: VRUser | ScreenUser;
  #physicalObjectsManager: PhysicalObjectsManager;

  #serverDataManager: ServerDataManager;

  #lastCallTime;
  #timeStep;
  #world;

  #dataSendTimeAccumulator;
  #dataSendTimeThreshold;

  #players: { [userID: string]: OtherPlayer } = {};

  #temp_quat;

  #container;
  constructor(
    container: HTMLElement,
    windowInnerWidth: number,
    windowInnerHeight: number
  ) {
    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(
      75,
      windowInnerWidth / windowInnerHeight,
      0.1,
      10
    );

    this.#temp_quat = new THREE.Quaternion();

    this.#dataSendTimeAccumulator = 0;
    this.#dataSendTimeThreshold = 0.1;

    this.#serverDataManager = new ServerDataManager();

    this.#serverDataManager.registerNewUserCallback((userID) => {
      this.#players[userID] = new OtherPlayer(userID);
      this.#players[userID].addToScene(this.#scene);
    });
    this.#serverDataManager.registerRemoveUserCallback((userID) => {
      this.#players[userID].removeFromScene(this.#scene);
      delete this.#players[userID];
    });

    this.#serverDataManager.registerUpdatePlayerCallback(
      (userID, playerData) => {
        this.#players[userID].setPlayerData(playerData);
      }
    );

    this.#serverDataManager.registerGrabObjectCallback((userID, grabData) => {
      const object = this.#physicalObjectsManager.getPhysObjectByName(
        grabData.objectName
      );
      if (object) {
        this.#players[userID].grabObject(
          object,
          grabData.controllerIndex,
          grabData.objectPosition
        );
        this.#physicalObjectsManager.setObjectVelocity(grabData.objectName, {
          x: 0,
          y: 0,
          z: 0,
        });
        this.#physicalObjectsManager.setObjectAngularVelocity(
          grabData.objectName,
          { x: 0, y: 0, z: 0 }
        );
      } else {
        console.error("Object not found", userID, grabData.objectName);
      }
    });

    this.#serverDataManager.registerReleaseObjectCallback(
      (userID, releaseData) => {
        const object = this.#players[userID].getHeldObject(
          releaseData.controllerIndex
        );
        console.log(releaseData.objectName, object);
        if (object) {
          this.#physicalObjectsManager.setObjectWorldPosition(
            releaseData.objectName,
            releaseData.objectPosition
          );
          console.log(releaseData.objectQuaternion);
          this.#temp_quat.set(
            releaseData.objectQuaternion._x,
            releaseData.objectQuaternion._y,
            releaseData.objectQuaternion._z,
            releaseData.objectQuaternion._w
          );
          this.#physicalObjectsManager.setObjectWorldQuaternion(
            releaseData.objectName,
            this.#temp_quat
          );
          this.#physicalObjectsManager.setObjectVelocity(
            releaseData.objectName,
            releaseData.objectVelocity
          );
          this.#physicalObjectsManager.reAttachObjectMesh(object);
        }
      }
    );

    this.#serverDataManager.start();

    this.#container = container;
    this.#lastCallTime = 0;
    this.#timeStep = 1 / 60;
    this.#world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.#wasPresenting = false;

    this.#renderer = new THREE.WebGLRenderer({ antialias: true });
    this.#renderer.setSize(window.innerWidth, window.innerHeight);
    this.#renderer.outputEncoding = THREE.sRGBEncoding;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.xr.enabled = true;
    this.#renderer.setPixelRatio(window.devicePixelRatio);
  }

  getRenderer() {
    return this.#renderer;
  }

  init(sessionType: string) {
    const scene = this.#scene;

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // make it face up
    groundBody.position.set(0, -1.325, 0);
    this.#world.addBody(groundBody);

    this.#physicalObjectsManager = new PhysicalObjectsManager(this.#world);

    scene.add(this.#physicalObjectsManager.getPhysObjectsMeshes());
    this.#physicalObjectsManager.addBox("box", { x: -1, y: 0, z: 1 });
    this.#physicalObjectsManager.addSphere("sphere", { x: 0, y: 1, z: 1.2 });

    if (sessionType == "vr") {
      this.#user = new VRUser({
        renderer: this.#renderer,
        camera: this.#camera,
        container: this.#container,
        physicalObjectsManager: this.#physicalObjectsManager,
      });
      this.#user.setPosition(0, -1, 3);
      this.#user.registerGrabObjectCallback((grabObjectData) => {
        this.#serverDataManager.sendToAll({
          grabObject: grabObjectData,
        });
      });
      this.#user.registerReleaseObjectCallback((releaseObjectData) => {
        this.#serverDataManager.sendToAll({
          releaseObject: releaseObjectData,
        });
      });
    } else {
      this.#user = new ScreenUser({
        renderer: this.#renderer,
        camera: this.#camera,
        container: this.#container,
      });
    }

    scene.add(this.#user.getDolly());

    //this.#wasPresenting = this.#renderer.xr.isPresenting;
    const loader = new GLTFLoader();

    loader.load(
      "cliffRoom_03.gltf",
      function (gltf) {
        const model = gltf.scene;
        model.scale.set(0.01, 0.01, 0.01);
        model.rotateY(30);
        scene.add(model);
      },
      undefined,
      function (error) {
        console.error(error);
      }
    );

    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(1, 1, 1);
    scene.add(light);
  }

  onWindowResize() {
    this.#camera.aspect = window.innerWidth / window.innerHeight;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(window.innerWidth, window.innerHeight);
  }

  #update() {
    const time = performance.now() / 1000; // seconds
    let dt = 0;
    dt = time - this.#lastCallTime;
    this.#dataSendTimeAccumulator += dt;
    this.#world.step(this.#timeStep, dt);
    this.#lastCallTime = time;

    this.#user.update(dt);
    this.#physicalObjectsManager.update();

    if (this.#dataSendTimeAccumulator > this.#dataSendTimeThreshold) {
      this.#dataSendTimeAccumulator = 0;
      const type = this.#user.getType();
      const body = {
        position: this.#user.getPosition(),
        quaternion: this.#user.getBodyQuaternion(),
      };
      const hands = this.#user.getControllerData();
      const head = this.#user.getHeadData();
      const playerData = { type, body, hand0: hands[0], hand1: hands[1], head };
      this.#serverDataManager.sendToAll({
        playerData,
      });
    }

    this.#renderer.render(this.#scene, this.#camera);
  }

  animate() {
    this.#lastCallTime = performance.now() / 1000;
    this.#renderer.setAnimationLoop(() => {
      this.#update();
    });
  }
}
