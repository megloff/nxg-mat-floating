import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, NgZone, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {fromEvent, of, Subject} from "rxjs";
import {Point} from "@angular/cdk/drag-drop/drag-ref";
import {map, switchMap, takeUntil} from "rxjs/operators";
import {NgxMatFloatingService} from "../ngx-mat-floating.service";

export enum NgxMatFloatingWrapperStatus {
    Ready, Pinned, Unpinned, InitialPosition, DragStart, Dragging, DragEnd, Destroyed
}

export enum RelativeReference {
    body = "body",
    window = "window",
    origin = "origin"
}

interface NgxMatFloatingContainerOptions {
    relativeReference: RelativeReference,
    contentContainerElement: HTMLElement,
    titleElement?: HTMLElement,
    width?: string | number,
}

@Component({
    selector: "ngx-mat-floating-component",
    templateUrl: "./ngx-mat-floating-wrapper.component.html",
    styleUrls: ["./ngx-mat-floating-wrapper.component.css"]
})
export class NgxMatFloatingWrapperComponent implements OnInit, OnDestroy, AfterViewInit {
    static floatingComponents: NgxMatFloatingWrapperComponent[] = [];

    @ViewChild("floatingContainer") floatingContainer: ElementRef<HTMLDivElement>;
    @ViewChild("floatingTitle") floatingTitle: ElementRef<HTMLDivElement>;
    @ViewChild("floatingContent") floatingContent: ElementRef<HTMLDivElement>;

    public stateChange: EventEmitter<NgxMatFloatingWrapperStatus> = new EventEmitter();

    private _title: string;
    private pinned: boolean = true;

    private relativeReference: RelativeReference;
    private titleParentElement: HTMLElement;
    private contentParentElement: HTMLElement;
    private zIndex: number;

    private lastPosition: Point = {x: 0, y: 0};

    private resized: boolean = false;
    private delta = {x: 0, y: 0};
    private offset = {x: 0, y: 0};
    private destroySubject: Subject<void> = new Subject<void>();

    private allowResize: boolean = true;

    constructor(private zone: NgZone, private changeDetector: ChangeDetectorRef, private service: NgxMatFloatingService) {
        this.zIndex = 900 + NgxMatFloatingWrapperComponent.floatingComponents.length;
        NgxMatFloatingWrapperComponent.floatingComponents.push(this);
    }

    // noinspection JSUnusedGlobalSymbols
    get title(): string {
        return this._title;
    }

    // noinspection JSUnusedGlobalSymbols
    set title(value: string) {
        this._title = value;
    }

    // noinspection JSUnusedGlobalSymbols
    public isPinned(): boolean {
        return this.pinned;
    }

    public bringToFront() {
        if (NgxMatFloatingWrapperComponent.floatingComponents[NgxMatFloatingWrapperComponent.floatingComponents.length - 1] !== this) {
            let idx = NgxMatFloatingWrapperComponent.floatingComponents.findIndex((c) => {
                return c === this
            });
            if (idx != -1) {
                NgxMatFloatingWrapperComponent.floatingComponents.splice(idx, 1);
            }

            NgxMatFloatingWrapperComponent.floatingComponents.push(this);

            let zIndex = 900;
            NgxMatFloatingWrapperComponent.floatingComponents.forEach((container) => {
                container.floatingContainer.nativeElement.style.zIndex = zIndex.toString();
                zIndex++;
            });
        }
    }

    public changeToUnpinned(options: NgxMatFloatingContainerOptions) {
        if (this.pinned) {
            this.hideFloatingContainer();

            const containerElementStyle = this.floatingContainer.nativeElement.style;

            if (options.titleElement) {
                this.titleParentElement = options.titleElement.parentElement;
                this.titleParentElement.replaceChild(this.createElementPlaceHolder(options.titleElement, "ngx-mat-floating-title-placeholder"), options.titleElement);
                this.floatingTitle.nativeElement.appendChild(options.titleElement);
            }

            this.contentParentElement = options.contentContainerElement.parentElement;

            let topLeft = this.getAbsoluteOffset(this.contentParentElement);

            this.contentParentElement.replaceChild(this.createElementPlaceHolder(options.contentContainerElement, "ngx-mat-floating-container-placeholder"), options.contentContainerElement);

            if (options.width) {
                containerElementStyle.width = typeof options.width == "number" ? options.width + "px" : options.width;
            }

            this.floatingContent.nativeElement.appendChild(options.contentContainerElement);

            this.relativeReference = options.relativeReference || RelativeReference.origin;
            switch (this.relativeReference) {
                case RelativeReference.body:
                    topLeft = {
                        y: window.pageYOffset + window.innerHeight / 4,
                        x: window.pageXOffset + (window.innerWidth - options.contentContainerElement.clientWidth) / 2
                    };
                    containerElementStyle.position = "absolute";
                    break;

                case RelativeReference.window:
                    topLeft = {
                        y: window.pageYOffset + window.innerHeight / 4,
                        x: (window.innerWidth - options.contentContainerElement.clientWidth) / 2
                    };
                    containerElementStyle.position = "fixed";
                    break;

                case RelativeReference.origin:
                    containerElementStyle.position = "absolute";
                    break;
            }

            containerElementStyle.top = topLeft.y + "px"
            containerElementStyle.left = topLeft.x + "px";

            this.floatingContainer.nativeElement.classList.remove("ngx-mat-floating-component-hidden");

            if (this.lastPosition.x !== 0 || this.lastPosition.y !== 0) {
                this.setPosition(this.lastPosition.x, this.lastPosition.y);
                this.stateChange.next(NgxMatFloatingWrapperStatus.InitialPosition);
            }

            this.pinned = false;

            this.stateChange.next(NgxMatFloatingWrapperStatus.Unpinned);
        }
    }

    public changeToPinned() {
        if (!this.pinned) {
            this.floatingContainer.nativeElement.style.transform = "translate(0px, 0px)";
            this.pinned = true;
            this.stateChange.next(NgxMatFloatingWrapperStatus.Pinned);
        }
    }

    public getDragHandleElement(): HTMLElement {
        return this.floatingTitle.nativeElement;
    }

    public setPosition(x: number, y: number) {
        this.lastPosition.x = x;
        this.lastPosition.y = y;
        this.floatingContainer.nativeElement.style.transform = `translate(${x}px, ${y}px)`;
    }

    public getBoundingRect(): ClientRect | DOMRect {
        return this.floatingContainer.nativeElement.getBoundingClientRect();
    }

    public setWrapperClass(wrapperClass: string) {
        this.floatingContainer.nativeElement.classList.add(...wrapperClass.split(/ /));
    }

    ngOnInit() {
    }

    ngAfterViewInit(): void {
        this.floatingContainer.nativeElement.style.zIndex = this.zIndex.toString();
        this.floatingContainer.nativeElement.addEventListener("transitionend", (ev) => {
            if (ev.srcElement == this.floatingContainer.nativeElement) {
                if (this.pinned) {
                    this.hideFloatingContainer();
                }
            }
        });
        this.setupEvents();
        this.stateChange.next(NgxMatFloatingWrapperStatus.Ready);
    }

    ngOnDestroy(): void {
        if (this.destroySubject && !this.destroySubject.closed) {
            this.destroySubject.next();
            this.destroySubject.complete();
        }

        this.stateChange.next(NgxMatFloatingWrapperStatus.Destroyed);
    }

    // noinspection JSMethodCanBeStatic
    private getAbsoluteOffset(element: HTMLElement): Point {
        let x = 0;
        let y = 0;

        while (element && !isNaN(element.offsetLeft) && !isNaN(element.offsetTop)) {
            x += element.offsetLeft - element.scrollLeft;
            y += element.offsetTop - element.scrollTop;
            element = element.offsetParent as HTMLElement;
        }

        return {y: y, x: x};
    }

    // noinspection JSMethodCanBeStatic
    private createElementPlaceHolder(referenceElement: HTMLElement, tagName?: string): HTMLElement {
        const placeholderElement = document.createElement(tagName || "div");
        placeholderElement.style.display = "block";
        placeholderElement.style.height = referenceElement.clientHeight + "px";
        placeholderElement.style.width = referenceElement.clientWidth + "px";
        placeholderElement.style.marginTop = referenceElement.style.marginTop;
        placeholderElement.style.marginBottom = referenceElement.style.marginBottom;

        return placeholderElement;
    }

    private setupEvents() {
        this.zone.runOutsideAngular(() => {
            const mouseDownEvent = fromEvent(this.getDragHandleElement(), "mousedown");
            const mouseUpEvent = fromEvent(document, "mouseup");
            const mouseMoveEvent = fromEvent(document, "mousemove");

            const mouseDragEvent = mouseDownEvent.pipe(takeUntil(this.destroySubject)).pipe(
                switchMap((event: MouseEvent) => {
                    if (this.pinned) {
                        return mouseMoveEvent;
                    } else {
                        this.stateChange.next(NgxMatFloatingWrapperStatus.DragStart);
                        this.floatingContainer.nativeElement.classList.add("ngx-mat-floating-component-dragging");
                        this.bringToFront();

                        const startX = event.clientX;
                        const startY = event.clientY;

                        if (this.allowResize) {
                            const rectX = this.getBoundingRect();

                            if (
                                // if the user is clicking on the bottom-right corner, he will resize the dialog
                                startY > rectX.bottom - 15 &&
                                startY <= rectX.bottom &&
                                startX > rectX.right - 15 &&
                                startX <= rectX.right
                            ) {
                                this.resized = true;
                                return of(null);
                            }
                        }

                        return mouseMoveEvent.pipe(
                            map((innerEvent: MouseEvent) => {
                                innerEvent.preventDefault();
                                innerEvent.stopPropagation();
                                this.delta = {
                                    x: innerEvent.clientX - startX,
                                    y: innerEvent.clientY - startY,
                                };
                            }),
                            takeUntil(mouseUpEvent)
                        );
                    }
                }),
                takeUntil(this.destroySubject)
            );

            mouseDragEvent.pipe(takeUntil(this.destroySubject)).subscribe(() => {
                if (!this.pinned) {
                    if (this.delta.x !== 0 && this.delta.y !== 0) {
                        this.stateChange.next(NgxMatFloatingWrapperStatus.Dragging);
                        this.contentParentElement.classList.add()
                        requestAnimationFrame(() => {
                            this.setPosition(this.offset.x + this.delta.x, this.offset.y + this.delta.y);
                        });
                    }
                }
            });

            mouseUpEvent.pipe(takeUntil(this.destroySubject)).subscribe(() => {
                if (!this.pinned) {
                    this.offset.x += this.delta.x;
                    this.offset.y += this.delta.y;
                    this.delta = {x: 0, y: 0};
                    this.changeDetector.markForCheck();

                    this.floatingContainer.nativeElement.classList.remove("ngx-mat-floating-component-dragging");
                    this.stateChange.next(NgxMatFloatingWrapperStatus.DragEnd);
                }
            });
        });
    }

    private hideFloatingContainer() {
        this.floatingContainer.nativeElement.classList.add("ngx-mat-floating-component-hidden");

        if (this.titleParentElement) {
            const titlePlaceholderElement = this.titleParentElement.querySelector("ngx-mat-floating-title-placeholder");
            if (titlePlaceholderElement) {
                this.titleParentElement.replaceChild(this.floatingTitle.nativeElement.firstElementChild, titlePlaceholderElement);
            }
            this.titleParentElement = null;
        }

        if (this.contentParentElement) {
            const contentPlaceholderElement = this.contentParentElement.querySelector("ngx-mat-floating-container-placeholder");
            if (contentPlaceholderElement) {
                this.contentParentElement.replaceChild(this.floatingContent.nativeElement.firstElementChild, contentPlaceholderElement);
            }
            this.contentParentElement = null;
        }
    }
}