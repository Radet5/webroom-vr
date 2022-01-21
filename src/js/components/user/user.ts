import * as THREE from "three";

interface UserParams {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
}

export class User {
  _renderer: THREE.WebGLRenderer;
  _camera: THREE.PerspectiveCamera;
  _container: HTMLElement;
  _dolly: THREE.Group;
  _moving: boolean;
  #temp_position: THREE.Vector3;
  #temp_quaternion: THREE.Quaternion;
  constructor({ renderer, camera, container }: UserParams) {
    this._renderer = renderer;
    this._camera = camera;
    this._container = container;
    this._moving = false;
    this._dolly = new THREE.Group();
    this._dolly.name = "user";
    this._dolly.add(this._camera);
    this._dolly.position.set(8.3, 4.25, 12.65);
    this._dolly.rotateY( Math.PI * 0.3);
    this.#temp_position = new THREE.Vector3();
    this.#temp_quaternion = new THREE.Quaternion();
  }

  getPosition() {
    return this._dolly.position;
  }

  setPosition(x: number, y: number, z: number) {
    this._dolly.position.set(x, y, z);
  }

  translateY(y: number) {
    this._dolly.translateY(y);
  }

  getBodyQuaternion() {
    return this._dolly.quaternion;
  }

  isMoving() {
    return this._moving;
  }

  getDolly() {
    return this._dolly;
  }

  getControllerData() {
    return [
      {
        position: this._dolly.position,
        quaternion: this._dolly.quaternion,
      },
      {
        position: this._dolly.position,
        quaternion: this._dolly.quaternion,
      },
    ];
  }

  getHeadData() {
    this.#temp_position.setFromMatrixPosition(this._camera.matrixWorld);
    return {
      position: this._camera.getWorldPosition(this.#temp_position),
      quaternion: this._camera.getWorldQuaternion(this.#temp_quaternion),
    };
  }

  getType() {
    return "user";
  }
}
