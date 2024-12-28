((m) => {

    const DEFAULT_CONTAINER_SELECTOR = ".container";
    const DEFAULT_ITEM_SELECTOR      = ".item";

    let renderingContext = {currentTime: 0};

    class BasicAnimationTask {
        constructor() {}

        init(ctx) {}

        update(ctx) {}

        stop(ctx) {}
    }

    class MoveToAnimation extends BasicAnimationTask {
        constructor(target, duration) {
            super();
            this.duration = duration;
            this.target   = target;

            this.startTime     = undefined;
            this.startPosition = undefined;

            this.curveAmount   = .6;
        }

        init(ctx) {
            this.startTime = renderingContext.currentTime;
            this.startPosition = ctx.objState.position;
        }

        update(ctx) {
            const time = renderingContext.currentTime - this.startTime;

            if (time >= this.duration)
                return true;

            const t = time / this.duration;
            const t2 = time / (this.duration + this.duration * this.curveAmount);
            


            ctx.objState.position.x = t * (this.target.x - this.startPosition.x) + this.startPosition.x;
            ctx.objState.position.y = t2 * (this.target.y - this.startPosition.y) + this.startPosition.y;

            return false;
        }
    }

    const FactoryTasks = {
        moveTo: (target, duration) => new MoveToAnimation(target, duration)
    }

    class AnimationTask {
        constructor(ctx, task) {
            this.task       = task;
            this.ctx        = ctx;
            this.isFinished = false;
            this.taskError  = null;
        }

        stop() {
            if (!this.task) return;

            try {
                this.task.stop();
            } catch(ex) {
                this.taskError = ex; 
                this.finished();
            }
        }

        init() {
            if (!this.task) return;

            try {
                this.task.init(this.ctx);
            } catch(ex) {
                this.taskError = ex; 
                this.finished();
            }
        }

        update() {
            if (!this.task || this.complete()) return;

            try {
                if (this.task.update(this.ctx))
                    this.finished();
            } catch(ex) {
                this.taskError = ex; 
                this.finished();
            }
        }

        finished() {
            this.isFinished = true;
        }

        complete() {
            return this.isFinished;
        }
    }

    class AnimationTasks {
        constructor(ctx) {
            this.ctx          = ctx;
            this._currentTask = null;
            this.taskList     = [];
        }

        clear() {
            if (this._currentTask)
                this._currentTask.stop();
            
            this._currentTask = null;
            this.taskList     = [];
        }

        addTask(task) {
            this.taskList.push(new AnimationTask(this.ctx, task));
        }

        popTask() {
            this._currentTask = this.taskList.shift();

            if (this._currentTask)
                this._currentTask.init();
            
            return this._currentTask;
        }

        getCurrentTask() {
            if (!this._currentTask)
                return this.popTask();
           
            if (!this._currentTask.complete())
                return this._currentTask;

            return this.popTask();
        }
    }

    class Animator {
        constructor(objState) {
            this.objState = objState;

            this.animationTasks = new AnimationTasks(this);
        }

        clear() {
            this.animationTasks.clear();
        }

        addAnimation(animationTask) {
            this.animationTasks.addTask(animationTask);
        }

        update() {
            const task = this.animationTasks.getCurrentTask();
            
            if (task) {
                task.update();
                this.objState.itemElement.style.transform = `translate(${this.objState.position.x}px, ${this.objState.position.y}px)`;
            }
        }
    }

    class ItemDragger {

        static currentInstance = null;
        static instances       = [];

        constructor(conf) {
            ItemDragger.setCurrentInstance(this);

            this.containerSelector = conf.selectors.container || DEFAULT_CONTAINER_SELECTOR;
            this.itemSelector      = conf.selectors.item      || DEFAULT_ITEM_SELECTOR;
            this.domContainer      = document.querySelector(this.containerSelector);

            if (!this.domContainer)
                throw new Error("Container element not found in DOM.");

            this.itemElements      = this.domContainer.querySelectorAll(this.itemSelector);

            this.gridSize          = null;

            this.mouseState        = {
                prevX:   undefined,
                prevY:   undefined,

                speed:   0,
                x:       undefined,
                y:       undefined,
                pressed: undefined,
                dx:      undefined,
                dy:      undefined
            };

            this.draggingMode    = false;
            this.gridElements    = [];
            this.draggingElement = null;

            this.xHitBoxPortion  = 0;
            this.yHitBoxPortion  = 0;

            this.startGrid_i     = 0;
            this.startGrid_j     = 0;

            this.needsPositionUpdate = true;

            this.orderMatrix         = conf.ordering || Array.from({ length: this.itemElements.length }, (_, i) => i);
        }

        attachMouseEvents() {
            window.addEventListener("mousemove", (e) => {
                const cbb         = this.getContainerBoundingBox();
                this.mouseState.x = e.clientX - cbb.x;
                this.mouseState.y = e.clientY - cbb.y;

                if (!this.mouseState.prevX) this.mouseState.prevX = this.mouseState.x;
                if (!this.mouseState.prevY) this.mouseState.prevY = this.mouseState.y;

                this.mouseState.dx = this.mouseState.x - this.mouseState.prevX;
                this.mouseState.dy = this.mouseState.y - this.mouseState.prevY;

                this.mouseState.prevX = this.mouseState.x;
                this.mouseState.prevY = this.mouseState.y;

                this.mouseState.speed = Math.sqrt(this.mouseState.dx * this.mouseState.dx + this.mouseState.dy * this.mouseState.dy);
            });


            window.addEventListener("mousedown", (e) => {
                
                const cbb         = this.getContainerBoundingBox();
                this.mouseState.x = e.clientX - cbb.x;
                this.mouseState.y = e.clientY - cbb.y;
                this.mouseState.pressed = true;
            });

            window.addEventListener("mouseup", (e) => {
                const cbb               = this.getContainerBoundingBox();
                this.mouseState.x       = e.clientX - cbb.x;
                this.mouseState.y       = e.clientY - cbb.y;
                this.mouseState.pressed = false;
            });
        }

        getContainerBoundingBox() {
            return this.domContainer.getBoundingClientRect();
        }

        draggingUpdate() {
            if (!this.draggingMode)
            {

                let hitElement = null;
                if (this.mouseState.pressed) {
                    hitElement = this.draggingElement = this.getHitElement();
                    if (hitElement)
                        hitElement.itemElement.classList.add("on-pressed");
                } else {
                    if (this.draggingElement)
                        this.draggingElement.itemElement.classList.remove("on-pressed");
                }

                if (this.mouseState.pressed && this.mouseState.speed > 1.5) {
                    if (hitElement) {
                        this.draggingElement = hitElement;
                        this.xHitBoxPortion = this.mouseState.x - this.draggingElement.position.x;
                        this.yHitBoxPortion = this.mouseState.y - this.draggingElement.position.y;
                        hitElement.itemElement.classList.remove("on-pressed");
                        this.startDragging(hitElement);
                    }
                }
            } else {
                if (!this.mouseState.pressed) {
                    this.stopDragging();
                    return;
                }

                const pos = this.draggingElement.position;

                
                pos.x = this.mouseState.x - this.xHitBoxPortion;
                pos.y = this.mouseState.y - this.yHitBoxPortion;
                
                const boxCenter = {x: pos.x + this.gridSize.cellWidth * .5, y: pos.y + this.gridSize.cellWidth * .5};

                const grid_j = Math.floor(boxCenter.x / this.gridSize.cellWidth);
                const grid_i = Math.floor(boxCenter.y / this.gridSize.cellWidth);

                // console.log(grid_j, grid_i);
                this.draggingElement.itemElement.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

                if (grid_i == this.startGrid_i && grid_j != this.startGrid_j) {
                    const cells = 8;
                    const min_j = Math.min(grid_j, this.startGrid_j);
                    const max_j = Math.max(grid_j, this.startGrid_j);

                    const spanned_elements = max_j - min_j;
                    const dir              = (grid_j - this.startGrid_j) / Math.abs(grid_j - this.startGrid_j);
                    
                    const [dest_j, dest_i] = [grid_j, grid_i];
                    if (dir < 0) {

                        for (let i = 0; i < spanned_elements; ++i) {
                            const curr_indx = cells * dest_i + (dest_j + i);
                            const new_indx  = cells * dest_i + (dest_j + i + 1)

                            const grd_el = this.gridElements[this.orderMatrix[curr_indx]];
                            if (!grd_el)
                                continue;

                            grd_el.animator.clear();
                            grd_el.animator.addAnimation(FactoryTasks.moveTo({
                                x: (dest_j + i + 1) * this.gridSize.cellWidth,
                                y: dest_i * this.gridSize.cellWidth
                            }, 500));

                            // this.orderMatrix[curr_indx] = ;
                        }
                    } else {
                        
                    }

                    this.startGrid_i = grid_i;
                    this.startGrid_j = grid_j;
                }
                
            }

            for (const element of this.gridElements) {
                if (element == this.draggingElement)
                    continue;

                element.animator.update();
            }
        }

        getHitElement() {
            for (const element of this.gridElements) {
                const pos   = element.position;
                const size  = element.size;
                const mouse = this.mouseState;
 
                if (mouse.x > pos.x && mouse.x < pos.x + size.width &&
                    mouse.y > pos.y && mouse.y < pos.y + size.height
                ) {
                    return element;
                }
            }

            return null;
        }

        selectItemElements() {
            return this.domContainer.querySelectorAll(this.itemSelector);
        }

        stopDragging() {
            this.draggingMode = false;
            this.domContainer.classList.remove("dragging-mode");
            if (this.draggingElement) {
                this.draggingElement.itemElement.classList.remove("dragging");
                
                this.draggingElement.animator.clear();
                this.draggingElement.animator.addAnimation(FactoryTasks.moveTo({ 
                    x: this.startGrid_j * this.gridSize.cellWidth, y: this.startGrid_i * this.gridSize.cellWidth 
                }, 500));

                this.draggingElement = null;
            }
        }

        startDragging(hitElement) {
            if (this.draggingMode)
                return;

            this.itemElements = this.selectItemElements();
            
            if (!this.itemElements || this.itemElements.length < 1)
                return;
            
            this.draggingMode = true;
            this.domContainer.classList.add("dragging-mode");

            hitElement.itemElement.classList.add("dragging");

            const boundingBox = this.itemElements[0].getBoundingClientRect();
            this.gridSize = {cellWidth: boundingBox.width, cellWidth: boundingBox.height};


            // compute the current i, j of the selected element to drag.
            const pos = this.draggingElement.position;

            pos.x = this.mouseState.x - this.xHitBoxPortion;
            pos.y = this.mouseState.y - this.yHitBoxPortion;
            
            const boxCenter = {x: pos.x + this.gridSize.cellWidth * .5, y: pos.y + this.gridSize.cellWidth * .5};
            
            this.startGrid_i = Math.floor(boxCenter.y / this.gridSize.cellWidth);
            this.startGrid_j = Math.floor(boxCenter.x / this.gridSize.cellWidth);

            console.log("starting at: ", this.startGrid_j, this.startGrid_i);
        }
        
        start() {
            renderingContext = {currentTime: 0};

            this.initGridElements();
            this.attachMouseEvents();

            const draggingLoop = (t) => {
                renderingContext.currentTime = t;

                this.draggingUpdate();
                requestAnimationFrame(draggingLoop);
            };

            requestAnimationFrame(draggingLoop);
        }

        initGridElements() {
            const conatinerBox = this.domContainer.getBoundingClientRect();

            this.gridElements = [];
            
            for (const itemElement of this.itemElements) {
                const boundingBox      = itemElement.getBoundingClientRect();
                const draggingState = {
                    position: {x: boundingBox.x - conatinerBox.x, y: boundingBox.y - conatinerBox.y},
                    size: {width: boundingBox.width, height: boundingBox.height},
                    animator: null,
                    itemElement: itemElement
                };

                draggingState.animator = new Animator(draggingState);

                this.gridElements.push(draggingState);
            }

            for (const gridElement of this.gridElements) {
                gridElement.itemElement.style.position   = "absolute";
                gridElement.itemElement.style.transform  = `translate(${gridElement.position.x}px, ${gridElement.position.y}px)`;
            }
        }

        static setCurrentInstance(instance) {
            ItemDragger.currentInstance = instance;
        }

        static init(conf) {
            ItemDragger.instances.push(new ItemDragger(conf));
        }
    }

    m.ItemDragger = ItemDragger;  
})(window);