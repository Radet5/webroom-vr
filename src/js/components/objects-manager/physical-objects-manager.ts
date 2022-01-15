import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PhysicalObjectsManager {
  #phys_objs;
  #world;
  constructor (world) {
    this.#world = world;
    this.#phys_objs = {meshes: new THREE.Group(), bodies: {}};
  }

  getPhysObjects() {
    return this.#phys_objs;
  }

  addBox(name, world_pos) {
    const boxgeometry = new THREE.BoxGeometry();
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const boxMesh = new THREE.Mesh(boxgeometry, boxMaterial);
    boxMesh.scale.set(0.1, 0.1, 0.1);
    const size = 0.05;
    const halfExtents = new CANNON.Vec3(size, size, size)
    const boxShape = new CANNON.Box(halfExtents)
    const boxBody = new CANNON.Body({ mass: 1, shape: boxShape })
    this.#addPhysObject(boxBody, boxMesh, name, world_pos);
  }

  addSphere(name, world_pos) {
    const sphereBody = new CANNON.Body({
      mass: 5, // kg
      shape: new CANNON.Sphere(0.1),
    })
    const geo = new THREE.SphereGeometry(0.1)
    const mat= new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(geo, mat)
    this.#addPhysObject(sphereBody, sphereMesh, name, world_pos);
  }

  #addPhysObject(body, mesh, name, position) {
    this.#phys_objs.bodies[name] = body;
    body.position.set(...position); // m
    this.#world.addBody(body);
    mesh.userData.name = name;
    mesh.position.set(...position); // m
    this.#phys_objs.meshes.add(mesh);
  }

}