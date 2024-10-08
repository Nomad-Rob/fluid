class Particle {
  constructor(posX, posY, velX, velY) {
    this.posX = posX;
    this.posY = posY;

    this.prevX = posX;
    this.prevY = posY;

    this.velX = velX;
    this.velY = velY;

    this.springs = {}
  }
}

function moveParticleData(dst, src) {
  dst.posX = src.posX;
  dst.posY = src.posY;
  dst.prevX = src.prevX;
  dst.prevY = src.prevY;
  dst.velX = src.velX;
  dst.velY = src.velY;

  dst.springs = src.springs;
}

class Material {
  constructor(name, restDensity, stiffness, nearStiffness, kernelRadius) {
    this.name = name;
    this.restDensity = restDensity;
    this.stiffness = stiffness;
    this.nearStiffness = nearStiffness;
    this.kernelRadius = kernelRadius;
    this.pointSize = 5;
    this.gravX = 0.0;
    this.gravY = 0.5;
    this.dt = 1;

    this.springStiffness = 0.0;
    this.plasticity = 0.5; // alpha
    this.yieldRatio = 0.25; // gamma
    this.minDistRatio = .25; // prevents the springs from getting too short

    this.linViscosity = 0.0;
    this.quadViscosity = 0.1;
    
    this.maxPressure = 1;
  }
}

class Spring {
  constructor(particleIdxA, particleIdxB, restLength) {
    this.particleIdxA = particleIdxA;
    this.particleIdxB = particleIdxB;
    this.restLength = restLength;
  }
}

class Cloud {
  constructor(x, y, width) {
    this.x = x;
    this.y = y;
    this.width = width;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(200, 200, 255, 0.8)";
    ctx.fillRect(this.x, this.y, this.width, 30);
    ctx.restore();
  }
}

class Cats {
  constructor(imageSrc, x, y) {
    this.originalImage = new Image();
    this.originalImage.src = imageSrc;

    this.x = x;
    this.y = y;
    this.width = 100;  // Placeholder values; will be updated after cropping
    this.height = 100;

    this.dragging = false;
    this.visible = false;

    // Once the image is loaded, crop it
    this.originalImage.onload = () => {
      this.cropImage(this.originalImage, (croppedImage) => {
        // After cropping, use the cropped image for rendering
        this.image = croppedImage;
        this.width = this.image.width;
        this.height = this.image.height;
      });
    };
  }
  
  // Function to crop the image (using the previously provided cropImage logic)
  cropImage(image, callback) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    canvas.width = image.width;
    canvas.height = image.height;

    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let top = null, bottom = null, left = null, right = null;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];

        if (alpha > 0) {
          if (top === null) top = y;
          if (left === null || x < left) left = x;
          if (right === null || x > right) right = x;
          bottom = y;
        }
      }
    }

    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedCtx = croppedCanvas.getContext("2d");

    croppedCtx.drawImage(
      canvas,
      left, top, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );

    const croppedImage = new Image();
    croppedImage.src = croppedCanvas.toDataURL();
    croppedImage.onload = () => callback(croppedImage);
  }

  draw(ctx) {
    if (!this.visible || !this.image) return;

    ctx.save();
    ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2);
    ctx.restore();
  }

  // Check collision between a particle and the rock
  checkCollision(particle) {
    if (!this.visible || !this.image) return;

    const dx = particle.posX - this.x;
    const dy = particle.posY - this.y;

    if (
      dx > -this.width / 2 &&
      dx < this.width / 2 &&
      dy > -this.height / 2 &&
      dy < this.height / 2
    ) {
      const overlapX = (this.width / 2 - Math.abs(dx)) * Math.sign(dx);
      const overlapY = (this.height / 2 - Math.abs(dy)) * Math.sign(dy);

      if (Math.abs(overlapX) < Math.abs(overlapY)) {
        particle.posX += overlapX;
      } else {
        particle.posY += overlapY;
      }

      particle.velX *= -0.5;
      particle.velY *= -0.5;
    }
  }

  isMouseOver(mouseX, mouseY) {
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;

    return (
      dx > -this.width / 2 &&
      dx < this.width / 2 &&
      dy > -this.height / 2 &&
      dy < this.height / 2
    );
  }
}


class Simulator {
  constructor(width, height, numParticles) {
    this.running = false;

    this.width = width;
    this.height = height;

    this.particles = [];
    this.addParticles(numParticles);

    this.screenX = window.screenX;
    this.screenY = window.screenY;
    this.screenMoveSmootherX = 0;
    this.screenMoveSmootherY = 0;

    this.mouseX = width / 2;
    this.mouseY = height / 2;
    this.attract = false;
    this.repel = false;
    this.emit = false;
    this.drain = false;
    this.drag = false;

    this.mousePrevX = this.mouseX;
    this.mousePrevY = this.mouseY;

    this.useSpatialHash = true;
    this.numHashBuckets = 5000;
    this.numActiveBuckets = 0;
    this.activeBuckets = [];
    this.particleListHeads = []; // Same size as numHashBuckets, each points to first particle in bucket list

    // Initialize the cats
    this.cats = new Cats('cats.png', width / 2, height / 2);
    
    // Rain stuff
    this.rainEnabled = false;
    this.clouds = [];
    this.maxRaindrops = numParticles * 2; // Max particle count (double original)
  
    for (let i = 0; i < this.numHashBuckets; i++) {
      this.particleListHeads.push(-1);
      this.activeBuckets.push(0);
    }

    this.particleListNextIdx = []; // Same size as particles list, each points to next particle in bucket list

    this.material = new Material("water", 4, 0.5, 0.5, 40);

    this.springHash = {};
  }
  
  addParticles(count) {
    for (let i = 0; i < count; i++) {
      const posX = Math.random() * this.width;
      const posY = Math.random() * this.height;
      const velX = Math.random() * 2 - 1;
      const velY = Math.random() * 2 - 1;

      this.particles.push(new Particle(posX, posY, velX, velY));
    }
  }

  emitParticles() {
    const emitRate = 10;

    for (let i = 0; i < emitRate; i++) {
      const posX = this.mouseX + Math.random() * 10 - 5;
      const posY = this.mouseY + Math.random() * 10 - 5;
      const velX = Math.random() * 2 - 1;
      const velY = Math.random() * 2 - 1;

      this.particles.push(new Particle(posX, posY, velX, velY));
    }
  }

  drainParticles() {
    let numParticles = this.particles.length;

    const affectedIds = [];

    for (let i = 0; i < numParticles; i++) {
      let p = this.particles[i];

      const dx = p.posX - this.mouseX;
      const dy = p.posY - this.mouseY;
      const distSq = dx * dx + dy * dy;

      if (distSq < 10000) {
        affectedIds.push(i);
        affectedIds.push(numParticles - 1);
        moveParticleData(p, this.particles[numParticles - 1]);
        numParticles--;
      }
    }

    this.particles.length = numParticles;


    console.log(affectedIds);

    for (let p of this.particles) {
      for (let i of affectedIds) {
        delete p.springs[i];
      }
    }
  }
  
  // Rain-related methods
  addClouds() {
    const cloudWidth = 150;
    const numClouds = Math.floor(this.width / cloudWidth);

    this.clouds = [];
    for (let i = 0; i < numClouds; i++) {
      const cloudX = i * cloudWidth + Math.random() * 50;
      this.clouds.push(new Cloud(cloudX, 20, cloudWidth));
    }
  }
  
  // Remove particles closest to the screen edges
  removeEdgeParticles() {
    const edgeThreshold = 50; // Distance from the edge to consider "edge" particles
    const numParticlesToRemove = 1; // Number of particles to remove each frame

    const edgeParticles = this.particles.filter(p => {
      return (
        p.posX < edgeThreshold ||
        p.posX > this.width - edgeThreshold ||
        p.posY < edgeThreshold ||
        p.posY > this.height - edgeThreshold
      );
    });

    // Sort by closest to the edge first (could improve performance by not sorting for large counts)
    edgeParticles.sort((a, b) => {
      const distA = Math.min(a.posX, this.width - a.posX, a.posY, this.height - a.posY);
      const distB = Math.min(b.posX, this.width - b.posX, b.posY, this.height - b.posY);
      return distA - distB;
    });

    // Remove the closest particles to the edge
    for (let i = 0; i < Math.min(numParticlesToRemove, edgeParticles.length); i++) {
      const index = this.particles.indexOf(edgeParticles[i]);
      if (index !== -1) {
        this.particles.splice(index, 1); // Remove particle from array
      }
    }
  }

  removeClouds() {
    this.clouds = [];
  }

  spawnRainParticle() {
    // If we've reached the max particle limit, remove edge particles first
    if (this.particles.length >= this.maxRaindrops) {
      this.removeEdgeParticles();
    }

    if (this.particles.length < this.maxRaindrops) {
      const randomCloud = this.clouds[Math.floor(Math.random() * this.clouds.length)];
      const x = randomCloud.x + Math.random() * randomCloud.width;
      const y = randomCloud.y + 30;
      const velX = Math.random() * 0.5 - 0.25; // Small horizontal velocity
      const velY = Math.random() * 2 + 1; // Vertical velocity
      this.particles.push(new Particle(x, y, velX, velY));
    }
  }

  updateRain() {
    if (this.rainEnabled) {
      this.spawnRainParticle();
    }
  }

  drawRain(ctx) {
    for (let cloud of this.clouds) {
      cloud.draw(ctx);
    }
  }

  draw(ctx) {
    ctx.save();

    const pointSize = this.material.pointSize;

    // Loop through each particle and draw it as a circle
    for (let p of this.particles) {
      const speed = Math.sqrt(p.velX * p.velX + p.velY * p.velY); // Calculate speed

      // Normalize speed to a value between 0 and 1 (for color interpolation)
      const maxSpeed = 10;  // You can adjust this based on how fast particles can move
      const normalizedSpeed = Math.min(speed / maxSpeed, 1); // Limit to 1

      // Interpolate color from blue (0, 0, 255) to red (255, 0, 0)
      const red = Math.floor(255 * normalizedSpeed);        // Increase red with speed
      const blue = Math.floor(255 * (1 - normalizedSpeed)); // Decrease blue with speed

      // Set particle color based on speed
      ctx.fillStyle = `rgb(${red}, 0, ${blue})`;

      // Draw the particle as a circle
      ctx.beginPath();
      ctx.arc(p.posX, p.posY, pointSize / 2, 0, Math.PI * 2);  // pointSize determines the radius
      ctx.fill();
      ctx.closePath();
      
      this.cats.draw(ctx);
    }

    ctx.restore();
  }

  // Algorithm 1: Simulation step
  update() {
    this.screenMoveSmootherX += window.screenX - this.screenX;
    this.screenMoveSmootherY += window.screenY - this.screenY;
    this.screenX = window.screenX;
    this.screenY = window.screenY;

    const maxScreenMove = 50;
    const screenMoveX = this.screenMoveSmootherX > maxScreenMove ? maxScreenMove : this.screenMoveSmootherX < -maxScreenMove ? -maxScreenMove : this.screenMoveSmootherX;
    const screenMoveY = this.screenMoveSmootherY > maxScreenMove ? maxScreenMove : this.screenMoveSmootherY < -maxScreenMove ? -maxScreenMove : this.screenMoveSmootherY;

    this.screenMoveSmootherX -= screenMoveX;
    this.screenMoveSmootherY -= screenMoveY;

    const dragX = this.mouseX - this.mousePrevX;
    const dragY = this.mouseY - this.mousePrevY;
    this.mousePrevX = this.mouseX;
    this.mousePrevY = this.mouseY;
    
    this.updateRain(); // Update rain if enabled

    if (!this.running) {
      return;
    }

    if (this.emit) {
      this.emitParticles();
    }

    if (this.drain) {
      this.drainParticles();
    }

    this.populateHashGrid();

    const dt = this.material.dt;

    const gravX = 0.02 * this.material.kernelRadius * this.material.gravX * dt;
    const gravY = 0.02 * this.material.kernelRadius * this.material.gravY * dt;

    let attractRepel = this.attract ? 0.01 * this.material.kernelRadius : 0;
    attractRepel -= this.repel ? 0.01 * this.material.kernelRadius : 0;
    const arNonZero = attractRepel !== 0;

    for (let p of this.particles) {
      // apply gravity
      p.velX += gravX;
      p.velY += gravY;
      // Check for cats collision
      this.cats.checkCollision(p);
      

      if (arNonZero) {
        let dx = p.posX - this.mouseX;
        let dy = p.posY - this.mouseY;
        const distSq = dx * dx + dy * dy;

        if (distSq < 100000 && distSq > 0.1) {
          const dist = Math.sqrt(distSq);
          const invDist = 1 / dist;

          dx *= invDist;
          dy *= invDist;

          p.velX -= attractRepel * dx;
          p.velY -= attractRepel * dy;
        }
      }

      if (this.drag) {
        let dx = p.posX - this.mouseX;
        let dy = p.posY - this.mouseY;
        const distSq = dx * dx + dy * dy;

        if (distSq < 10000 && distSq > 0.1) {
          const dist = Math.sqrt(distSq);
          const invDist = 1 / dist;

          p.velX = dragX;
          p.velY = dragY;
        }
      }

      p.posX -= screenMoveX;
      p.posY -= screenMoveY;
    }
    
    this.applyViscosity(dt);

    const boundaryMul = 0.5 * dt; // 1 is no bounce, 2 is full bounce
    const boundaryMinX = 5;
    const boundaryMaxX = this.width - 5;
    const boundaryMinY = 5;
    const boundaryMaxY = this.height - 5;

    for (let p of this.particles) {
      // save previous position
      p.prevX = p.posX;
      p.prevY = p.posY;

      // advance to predicted position
      p.posX += p.velX * dt;
      p.posY += p.velY * dt;

      // Could do boundary both before and after density relaxation
      // if (p.posX < boundaryMinX) {
      //   p.posX += boundaryMul * (boundaryMinX - p.posX);
      // } else if (p.posX > boundaryMaxX) {
      //   p.posX += boundaryMul * (boundaryMaxX - p.posX);
      // }

      // if (p.posY < boundaryMinY) {
      //   p.posY += boundaryMul * (boundaryMinY - p.posY);
      // } else if (p.posY > boundaryMaxY) {
      //   p.posY += boundaryMul * (boundaryMaxY - p.posY);
      // }
    }

    this.adjustSprings(dt);
    this.applySpringDisplacements(dt);
    this.doubleDensityRelaxation(dt);
    this.resolveCollisions(dt);

    const dtInv = 1 / dt;

    for (let p of this.particles) {
      // use previous position to calculate new velocity
      p.velX = (p.posX - p.prevX) * dtInv;
      p.velY = (p.posY - p.prevY) * dtInv;
    }
  }

  doubleDensityRelaxation(dt) {
    const numParticles = this.particles.length;
    const kernelRadius = this.material.kernelRadius; // h
    const kernelRadiusSq = kernelRadius * kernelRadius;
    const kernelRadiusInv = 1.0 / kernelRadius;

    const restDensity = this.material.restDensity;
    const stiffness = this.material.stiffness * dt * dt;
    const nearStiffness = this.material.nearStiffness * dt * dt;

    const minDistRatio = this.material.minDistRatio;
    const minDist = minDistRatio * kernelRadius;

    // Neighbor cache
    const neighbors = [];
    const neighborUnitX = [];
    const neighborUnitY = [];
    const neighborCloseness = [];
    const visitedBuckets = [];

    const numActiveBuckets = this.numActiveBuckets;

    const wallCloseness = [0, 0]; // x, y
    const wallDirection = [0, 0]; // x, y

    const boundaryMinX = 5;
    const boundaryMaxX = this.width - 5;
    const boundaryMinY = 5;
    const boundaryMaxY = this.height - 5;

    const softMinX = boundaryMinX + kernelRadius;
    const softMaxX = boundaryMaxX - kernelRadius;
    const softMinY = boundaryMinY + kernelRadius;
    const softMaxY = boundaryMaxY - kernelRadius;

    const addSprings = this.material.springStiffness > 0;


    for (let abIdx = 0; abIdx < numActiveBuckets; abIdx++) {
      let selfIdx = this.particleListHeads[this.activeBuckets[abIdx]];

      while (selfIdx != -1) {
        let p0 = this.particles[selfIdx];

        let density = 0;
        let nearDensity = 0;

        let numNeighbors = 0;
        let numVisitedBuckets = 0;

        // Compute density and near-density
        const bucketX = Math.floor(p0.posX * kernelRadiusInv);
        const bucketY = Math.floor(p0.posY * kernelRadiusInv);

        for (let bucketDX = -1; bucketDX <= 1; bucketDX++) {
          for (let bucketDY = -1; bucketDY <= 1; bucketDY++) {
            const bucketIdx = this.getHashBucketIdx(Math.floor(bucketX + bucketDX), Math.floor(bucketY + bucketDY));

            // Check hash collision
            let found = false;
            for (let k = 0; k < numVisitedBuckets; k++) {
              if (visitedBuckets[k] === bucketIdx) {
                found = true;
                break;
              }
            }

            if (found) {
              continue;
            }

            visitedBuckets[numVisitedBuckets] = bucketIdx;
            numVisitedBuckets++;

            let neighborIdx = this.particleListHeads[bucketIdx];

            while (neighborIdx != -1) {
              if (neighborIdx === selfIdx) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              let p1 = this.particles[neighborIdx];

              const diffX = p1.posX - p0.posX;

              if (diffX > kernelRadius || diffX < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const diffY = p1.posY - p0.posY;

              if (diffY > kernelRadius || diffY < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const rSq = diffX * diffX + diffY * diffY;

              if (rSq < kernelRadiusSq) {
                const r = Math.sqrt(rSq);
                const q = r * kernelRadiusInv;
                const closeness = 1 - q;
                const closenessSq = closeness * closeness;

                density += closeness * closeness;
                nearDensity += closeness * closenessSq;

                neighbors[numNeighbors] = p1;
                neighborUnitX[numNeighbors] = diffX / r;
                neighborUnitY[numNeighbors] = diffY / r;
                neighborCloseness[numNeighbors] = closeness;
                numNeighbors++;

                // Add spring if not already present
                // TODO: this JS hash thing is absolutely crazy but curious how it performs
                if (addSprings && selfIdx < neighborIdx && r > minDist && !p0.springs[neighborIdx]) {
                  p0.springs[neighborIdx] = r;
                }
              }

              neighborIdx = this.particleListNextIdx[neighborIdx];
            }
          }
        }


        // Compute pressure and near-pressure
        let pressure = stiffness * (density - restDensity);
        let nearPressure = nearStiffness * nearDensity;
        let immisciblePressure = stiffness * (density - 0);

        // Optional: Clamp pressure for stability
        // const pressureSum = pressure + nearPressure;

        // if (pressureSum > 1) {
        //   const pressureMul = 1 / pressureSum;
        //   pressure *= pressureMul;
        //   nearPressure *= pressureMul;
        // }


        if (pressure > 1) {
          pressure = 1;
        }

        if (nearPressure > 1) {
          nearPressure = 1;
        }

        let dispX = 0;
        let dispY = 0;

        for (let j = 0; j < numNeighbors; j++) {
          let p1 = neighbors[j];

          const closeness = neighborCloseness[j];
          const D = (pressure * closeness + nearPressure * closeness * closeness) / 2;
          const DX = D * neighborUnitX[j];
          const DY = D * neighborUnitY[j];

          p1.posX += DX;
          p1.posY += DY;

          dispX -= DX;
          dispY -= DY;

          // p0.posX -= DX;
          // p0.posY -= DY;
        }

        p0.posX += dispX;
        p0.posY += dispY;

        selfIdx = this.particleListNextIdx[selfIdx];
      }
    }
  }

  // Mueller 10 minute physics
  getHashBucketIdx(bucketX, bucketY) {
    const h = ((bucketX * 92837111) ^ (bucketY * 689287499));
    return Math.abs(h) % this.numHashBuckets;
  }

  populateHashGrid() {
    // Clear the hash grid
    for (let i = 0; i < this.numActiveBuckets; i++) {
      this.particleListHeads[this.activeBuckets[i]] = -1;
    }

    for (let i = 0; i < this.numHashBuckets; i++) {
      this.particleListHeads[i] = -1;
    }

    this.numActiveBuckets = 0;

    // Populate the hash grid
    const numParticles = this.particles.length;
    const bucketSize = this.material.kernelRadius; // Same as kernel radius
    const bucketSizeInv = 1.0 / bucketSize;

    for (let i = 0; i < numParticles; i++) {
      let p = this.particles[i];

      const bucketX = Math.floor(p.posX * bucketSizeInv);
      const bucketY = Math.floor(p.posY * bucketSizeInv);

      const bucketIdx = this.getHashBucketIdx(bucketX, bucketY);

      const headIdx = this.particleListHeads[bucketIdx];

      if (headIdx === -1) {
        this.activeBuckets[this.numActiveBuckets] = bucketIdx;
        this.numActiveBuckets++;
      }

      this.particleListNextIdx[i] = headIdx;
      this.particleListHeads[bucketIdx] = i;
    }
  }

  applySpringDisplacements(dt) {
    if (this.material.springStiffness === 0) {
      return;
    }


    const kernelRadius = this.material.kernelRadius; // h
    const kernelRadiusInv = 1.0 / kernelRadius;

    const springStiffness = this.material.springStiffness * dt * dt;
    const plasticity = this.material.plasticity * dt; // alpha
    const yieldRatio = this.material.yieldRatio; // gamma
    const minDistRatio = this.material.minDistRatio;
    const minDist = minDistRatio * kernelRadius;

    for (let particle of this.particles) {
      // TODO: maybe optimize this by using a list of springs instead of a hash
      for (let springIdx of Object.keys(particle.springs)) {
        let restLength = particle.springs[springIdx];

        let springParticle = this.particles[springIdx];

        let dx = particle.posX - springParticle.posX;
        let dy = particle.posY - springParticle.posY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        const tolerableDeformation = yieldRatio * restLength;


        if (dist > restLength + tolerableDeformation) {
          restLength = restLength + plasticity * (dist - restLength - tolerableDeformation);
          particle.springs[springIdx] = restLength;
        } else if (dist < restLength - tolerableDeformation && dist > minDist) {
          restLength = restLength - plasticity * (restLength - tolerableDeformation - dist);
          particle.springs[springIdx] = restLength;
        }

        if (restLength < minDist) {
          restLength = minDist;
          particle.springs[springIdx] = restLength;
        }

        if (restLength > kernelRadius) {
          delete particle.springs[springIdx];
          continue;
        }

        let D = springStiffness * (1 - restLength * kernelRadiusInv) * (dist - restLength) / dist;
        dx *= D;
        dy *= D;

        particle.posX -= dx;
        particle.posY -= dy;

        springParticle.posX += dx;
        springParticle.posY += dy;
      }
    }
  }
  adjustSprings(dt) {
    // adjust springs has been moved to be done together with apply spring displacements
  }
  applyViscosity(dt) {
    if (this.material.linViscosity === 0 && this.material.quadViscosity === 0) {
      return;
    }

    const numActiveBuckets = this.numActiveBuckets;
    const visitedBuckets = [];

    const kernelRadius = this.material.kernelRadius; // h
    const kernelRadiusSq = kernelRadius * kernelRadius;
    const kernelRadiusInv = 1.0 / kernelRadius;

    const linViscosity = this.material.linViscosity * dt;
    const quadViscosity = this.material.quadViscosity * dt;

    for (let abIdx = 0; abIdx < numActiveBuckets; abIdx++) {
      let selfIdx = this.particleListHeads[this.activeBuckets[abIdx]];

      while (selfIdx != -1) {
        let p0 = this.particles[selfIdx];

        let density = 0;
        let nearDensity = 0;

        let numNeighbors = 0;
        let numVisitedBuckets = 0;

        // Compute density and near-density
        const bucketX = Math.floor(p0.posX * kernelRadiusInv);
        const bucketY = Math.floor(p0.posY * kernelRadiusInv);

        for (let bucketDX = -1; bucketDX <= 1; bucketDX++) {
          for (let bucketDY = -1; bucketDY <= 1; bucketDY++) {
            const bucketIdx = this.getHashBucketIdx(Math.floor(bucketX + bucketDX), Math.floor(bucketY + bucketDY));

            // Check hash collision
            let found = false;
            for (let k = 0; k < numVisitedBuckets; k++) {
              if (visitedBuckets[k] === bucketIdx) {
                found = true;
                break;
              }
            }

            if (found) {
              continue;
            }

            visitedBuckets[numVisitedBuckets] = bucketIdx;
            numVisitedBuckets++;

            let neighborIdx = this.particleListHeads[bucketIdx];

            while (neighborIdx != -1) {
              if (neighborIdx === selfIdx) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              let p1 = this.particles[neighborIdx];

              const diffX = p1.posX - p0.posX;

              if (diffX > kernelRadius || diffX < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const diffY = p1.posY - p0.posY;

              if (diffY > kernelRadius || diffY < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const rSq = diffX * diffX + diffY * diffY;

              if (rSq < kernelRadiusSq) {
                const r = Math.sqrt(rSq);
                const q = r * kernelRadiusInv;
                const closeness = 1 - q;
                const closenessSq = closeness * closeness;

                // inward radial velocity
                const dx = diffX / r;
                const dy = diffY / r;
                let inwardVel = ((p0.velX - p1.velX) * dx + (p0.velY - p1.velY) * dy);

                if (inwardVel > 1) {
                  inwardVel = 1;
                }

                if (inwardVel > 0) {
                  // linear and quadratic impulses
                  const I = closeness * (linViscosity * inwardVel + quadViscosity * inwardVel * inwardVel) * .5;
                  const IX = I * dx;
                  const IY = I * dy;
                  p0.velX -= IX;
                  p0.velY -= IY;
                  p1.velX += IX;
                  p1.velY += IY;
                }
              }

              neighborIdx = this.particleListNextIdx[neighborIdx];
            }
          }
        }

        selfIdx = this.particleListNextIdx[selfIdx];
      }
    }
  }
  resolveCollisions(dt) {
    const boundaryMul = 0.5 * dt * dt;
    const boundaryMinX = 5;
    const boundaryMaxX = this.width - 5;
    const boundaryMinY = 5;
    const boundaryMaxY = this.height - 5;

    const kWallStickiness = 0.5;
    const kWallStickDist = 2;
    const stickMinX = boundaryMinX + kWallStickDist;
    const stickMaxX = boundaryMaxX - kWallStickDist;
    const stickMinY = boundaryMinY + kWallStickDist;
    const stickMaxY = boundaryMaxY - kWallStickDist;


    for (let p of this.particles) {
      if (p.posX < boundaryMinX) {
        p.posX += boundaryMul * (boundaryMinX - p.posX);
      } else if (p.posX > boundaryMaxX) {
        p.posX += boundaryMul * (boundaryMaxX - p.posX);
      }

      if (p.posY < boundaryMinY) {
        p.posY += boundaryMul * (boundaryMinY - p.posY);
      } else if (p.posY > boundaryMaxY) {
        p.posY += boundaryMul * (boundaryMaxY - p.posY);
      }
    }
  }
}
