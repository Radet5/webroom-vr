import * as THREE from "three";
import * as CANNON from "cannon-es";

interface PhysicsObjectsInterface {
  meshes: THREE.Group;
  bodies: {
    [name: string]: CANNON.Body;
  };
}

interface Coordinates {
  x: number;
  y: number;
  z: number;
}

interface Rotation4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

export class PhysicalObjectsManager {
  #physicsObjects: PhysicsObjectsInterface;
  #world;
  constructor(world: CANNON.World) {
    this.#world = world;
    this.#physicsObjects = { meshes: new THREE.Group(), bodies: {} };
  }

  getPhysObjects() {
    return this.#physicsObjects;
  }

  getPhysObjectsMeshes() {
    return this.#physicsObjects.meshes;
  }

  setObjectVelocity(name: string, velocity: Coordinates) {
    this.#physicsObjects.bodies[name].velocity.set(
      velocity.x,
      velocity.y,
      velocity.z
    );
  }

  setObjectAngularVelocity(name: string, angularVelocity: Coordinates) {
    this.#physicsObjects.bodies[name].angularVelocity.set(
      angularVelocity.x,
      angularVelocity.y,
      angularVelocity.z
    );
  }

  setObjectWorldPosition(name: string, position: Coordinates) {
    this.#physicsObjects.bodies[name].position.set(
      position.x,
      position.y,
      position.z
    );
  }

  setObjectWorldQuaternion(name: string, quaternion: Rotation4D) {
    this.#physicsObjects.bodies[name].quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    );
  }

  reAttachObjectMesh(meshObject: THREE.Mesh) {
    this.#physicsObjects.meshes.attach(meshObject);
  }

  addBox(name: string, worldPosition: Coordinates) {
    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.scale.set(0.1, 0.1, 0.1);
    const size = 0.05;
    const halfExtents = new CANNON.Vec3(size, size, size);
    const boxShape = new CANNON.Box(halfExtents);
    const boxBody = new CANNON.Body({ mass: 1, shape: boxShape });
    this.#addPhysObject(boxBody, boxMesh, name, worldPosition);
  }

  addSphere(name: string, worldPosition: Coordinates) {
    const sphereBody = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(0.1),
    });
    const geo = new THREE.SphereGeometry(0.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(geo, mat);
    this.#addPhysObject(sphereBody, sphereMesh, name, worldPosition);
  }

  update() {
    //sync object mesh position with physics bodies
    const physicalObjectsBodies = this.#physicsObjects.bodies;
    this.#physicsObjects.meshes.children.forEach(function (mesh) {
      const body = physicalObjectsBodies[mesh.userData.name];
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
    });
  }

  #addPhysObject(
    body: CANNON.Body,
    mesh: THREE.Mesh,
    name: string,
    position: Coordinates
  ) {
    this.#physicsObjects.bodies[name] = body;
    body.position.set(position.x, position.y, position.z); // m
    this.#world.addBody(body);
    mesh.userData.name = name;
    mesh.position.set(position.x, position.y, position.z);
    this.#physicsObjects.meshes.add(mesh);
  }
}
