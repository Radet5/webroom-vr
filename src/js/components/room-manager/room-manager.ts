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

  #players: { [userID: string]: OtherPlayer } = {};

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

    this.#serverDataManager = new ServerDataManager();

    this.#serverDataManager.registerNewUserCallback((userID) => {
      this.#players[userID] = new OtherPlayer(userID);
      this.#players[userID].addToScene(this.#scene);
    });
    this.#serverDataManager.registerRemoveUserCallback((userID) => {
      this.#players[userID].removeFromScene(this.#scene);
      delete this.#players[userID];
    });

    this.#serverDataManager.registerUpdatePlayerPositionCallback(
      (userID, position) => {
        this.#players[userID].setPosition(position);
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

  init() {
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

    this.#user = new ScreenUser({
      renderer: this.#renderer,
      camera: this.#camera,
      container: this.#container,
    });
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
    this.#world.step(this.#timeStep, dt);
    this.#lastCallTime = time;

    this.#user.update(dt);
    this.#physicalObjectsManager.update();

    if (this.#renderer.xr.isPresenting && !this.#wasPresenting) {
      this.#user = new VRUser({
        renderer: this.#renderer,
        camera: this.#camera,
        container: this.#container,
        physicalObjectsManager: this.#physicalObjectsManager,
      });
      this.#scene.add(this.#user.getDolly());
      this.#user.setPosition(0, -1, 3);
      this.#wasPresenting = true;
    } else if (!this.#renderer.xr.isPresenting && this.#wasPresenting) {
      this.#user = new ScreenUser({
        renderer: this.#renderer,
        camera: this.#camera,
        container: this.#container,
      });
      this.#scene.add(this.#user.getDolly());
      this.#user.setPosition(0, 1, 3);
      this.#wasPresenting = false;
    }

    if (this.#user.isMoving()) {
      this.#serverDataManager.sendToAll({
        userPosition: this.#user.getPosition(),
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
