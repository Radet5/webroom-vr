import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";

interface ScreenUserParams {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
}

export class ScreenUser {
  #dolly;
  #camera;
  #speedFactor;
  #moving;
  #previousPosition: THREE.Vector3;
  #controls;
  #renderer;
  #temp_posistion;
  constructor({ renderer, camera, container }: ScreenUserParams) {
    this.#renderer = renderer;
    this.#camera = camera;
    this.#speedFactor = [0.1, 0.1, 0.1, 0.1];
    this.#moving = false;

    this.#temp_posistion = new THREE.Vector3();

    this.#previousPosition = new THREE.Vector3();

    this.#dolly = new THREE.Group();
    this.#dolly.position.set(0, 0, 3);
    this.#dolly.name = "user";
    this.#dolly.add(this.#camera);

    this.#controls = new PointerLockControls(camera, renderer.domElement);
    const controls = this.#controls;
    document.addEventListener(
      "click",
      function () {
        controls.lock();
      },
      false
    );
    const onKeyDown = function (event: KeyboardEvent) {
      switch (event.code) {
        case "KeyW":
          console.log("W");
          controls.moveForward(0.25);
          break;
        case "KeyA":
          controls.moveRight(-0.25);
          break;
        case "KeyS":
          controls.moveForward(-0.25);
          break;
        case "KeyD":
          controls.moveRight(0.25);
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown, false);
  }

  setPosition(x: number, y: number, z: number) {
    this.#dolly.position.set(x, y, z);
  }

  getPosition() {
    return this.#camera.getWorldPosition(this.#temp_posistion);
  }

  getDolly() {
    return this.#dolly;
  }

  isMoving() {
    return this.#moving;
  }

  update(dt: number) {
    if (this.#previousPosition.distanceTo(this.#camera.position) > 0.01) {
      this.#moving = true;
    } else {
      this.#moving = false;
    }
    this.#previousPosition.copy(this.#camera.position);
  }
}
