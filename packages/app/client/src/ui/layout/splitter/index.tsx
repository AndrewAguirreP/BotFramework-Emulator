//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.
//
// Microsoft Bot Framework: http://botframework.com
//
// Bot Framework Emulator Github:
// https://github.com/Microsoft/BotFramwork-Emulator
//
// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License:
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED ""AS IS"", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { css } from 'glamor';

import SplitterPane from './pane';
import * as Colors from '../../styles/colors';

const CSS = css({
  height: "100%",
  width: "100%",
  display: 'flex',
  flexFlow: 'column nowrap'
});

const DEFAULT_PANE_SIZE = 200;
const MIN_PANE_SIZE = 0;
const SPLITTER_SIZE = 0;
const SPLITTER_HIT_TARGET = 8;
const event = new Event('splitterResize');

export type SplitterOrientation = 'horizontal' | 'vertical';

interface ISplitterProps {
  children?: any;
  initialSizes?: { [paneIndex: number]: number | string } | (() => { [paneIndex: number]: number | string });
  minSizes?: { [paneIndex: number]: number };
  onSizeChange?: (sizes: any[]) => any;
  orientation?: SplitterOrientation;
  primaryPaneIndex?: number;
}

interface ISplitterState {
  paneSizes?: number[];
  resizing?: boolean;
}

export default class Splitter extends React.Component<ISplitterProps, ISplitterState> {
  private activeSplitter: any;
  private splitters: any[];
  private splitNum: number;
  private panes: any[];
  private paneNum: number;
  private containerSize: number;
  private containerRef: HTMLElement;

  private SPLITTER_CSS: any;
  private CONTAINER_CSS: any;
  private FLOATING_CANVAS_CSS: any;

  public static defaultProps: ISplitterProps = {
    minSizes: {}
  };

  constructor(props, context) {
    super(props, context);

    this.saveContainerRef = this.saveContainerRef.bind(this);
    this.saveSplitterRef = this.saveSplitterRef.bind(this);
    this.savePaneRef = this.savePaneRef.bind(this);

    this.onGrabSplitter = this.onGrabSplitter.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.checkForContainerResize = this.checkForContainerResize.bind(this);

    this.activeSplitter = null;

    // [{ ref: splitterRef, dimensions: ref.getBoundingClientRect() }]
    this.splitters = [];
    this.splitNum = 0;

    // [{ size: num, ref: paneRef }]
    this.panes = [];
    this.paneNum = 0;

    this.state = {
      resizing: false,
      paneSizes: []
    };
  }

  componentWillMount() {
    // set up event listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('splitterResize', this.checkForContainerResize);
    window.addEventListener('resize', this.checkForContainerResize);

    this.SPLITTER_CSS = this.props.orientation === 'horizontal' ?
      css({
        position: 'relative',
        height: SPLITTER_SIZE,
        width: '100%',
        backgroundColor: Colors.SPLITTER_BACKGROUND_DARK,
        flexShrink: 0,
        zIndex: 1,

        // inivisible hit target floating on top of splitter
        '& > div': {
          position: 'absolute',
          height: SPLITTER_HIT_TARGET,
          width: '100%',
          top: SPLITTER_HIT_TARGET / 2 * -1,
          left: 0,
          backgroundColor: 'transparent',
          cursor: 'ns-resize'
        }
      })
    :
      css({
        position: 'relative',
        height: '100%',
        width: SPLITTER_SIZE,
        backgroundColor: Colors.SPLITTER_BACKGROUND_DARK,
        flexShrink: 0,
        zIndex: 1,

        '& > div': {
          position: 'absolute',
          height: '100%',
          width: SPLITTER_HIT_TARGET,
          top: 0,
          left: SPLITTER_HIT_TARGET / 2 * -1,
          backgroundColor: 'transparent',
          cursor: 'ew-resize'
        }
      });

    this.CONTAINER_CSS = css({
      height: "100%",
      width: "100%",
      position: 'relative'
    });

    // float a canvas within the splitter container to deal with overflow issues
    const flexDir = this.props.orientation === 'horizontal' ? 'column' : 'row';
    this.FLOATING_CANVAS_CSS = css({
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      display: 'flex',
      flexFlow: `${flexDir} nowrap`,
    });
  }

  componentDidMount() {
    this.calculateInitialPaneSizes();
  }

  componentWillUnmount() {
    // remove event listeners
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('splitterResize', this.checkForContainerResize);
    window.removeEventListener('resize', this.checkForContainerResize);
  }

  componentWillReceiveProps(nextProps) {
    // if the number of children changes, recalculate pane sizes
    if (nextProps.children.length !== this.props.children.length) {
      this.props.children.length = nextProps.children.length;
      this.calculateInitialPaneSizes();
    }
  }

  calculateInitialPaneSizes(): void {
    const currentPaneSizes = this.state.paneSizes;
    this.containerSize = this.getContainerSize();

    const numberOfPanes = this.props.children.length;
    const numberOfSplitters = numberOfPanes - 1;

    let defaultPaneSize;
    let initialSizes = this.props.initialSizes;
    if (initialSizes) {
      if (typeof initialSizes === 'function')
        initialSizes = initialSizes();
    }

    if (initialSizes) {
      // subtract initial sizes from container size and distribute the remaining size equally
      let remainingContainerSize = this.containerSize;
      let defaultPanes = numberOfPanes;
      Object.keys(initialSizes).forEach(key => {
        // convert percentage to absolute value if necessary
        initialSizes[key] = typeof initialSizes[key] === 'string' ?
          parseInt(initialSizes[key]) / 100 * this.containerSize : initialSizes[key];

        if (isNaN(initialSizes[key])) {
          throw new Error(`Invalid value passed as element of initialSizes in Splitter: ${initialSizes[key]}`);
        }
        remainingContainerSize -= initialSizes[key];
        defaultPanes--;
      });
      defaultPaneSize = (remainingContainerSize - numberOfSplitters * SPLITTER_SIZE) / defaultPanes;
    } else {
      defaultPaneSize = (this.containerSize - numberOfSplitters * SPLITTER_SIZE) / numberOfPanes;
    }

    for (let i = 0; i < numberOfPanes; i++) {
      if (initialSizes && initialSizes[i]) {
        currentPaneSizes[i] = initialSizes[i];
      } else {
        currentPaneSizes[i] = defaultPaneSize;
      }
    }

    this.setState(({ paneSizes: currentPaneSizes }));
  }

  getContainerSize(): number {
    if (this.containerRef) {
      const containerDimensions = this.containerRef.getBoundingClientRect();
      return this.props.orientation === 'horizontal' ? containerDimensions.height : containerDimensions.width;
    }
    return null;
  }

  checkForContainerResize(e): void {
    // only recalculate secondary panes if there is a specified primary pane
    if (this.props.primaryPaneIndex || (this.props.primaryPaneIndex === 0)) {
      // only recalculate pane sizes if the container's size has changed at all
      const oldContainerSize = this.containerSize;
      const newContainerSize = this.getContainerSize();

      if (newContainerSize !== oldContainerSize) {
        this.containerSize = newContainerSize;
        this.calculateSecondaryPaneSizes(oldContainerSize, newContainerSize);
      }
    }
  }

  calculateSecondaryPaneSizes(oldContainerSize: number, newContainerSize: number): void {
    const containerSizeDelta = newContainerSize - oldContainerSize;

    // containerSizeDelta / number of secondary panes
    const secondaryPaneSizeAdjustment = containerSizeDelta / (this.panes.length - 1);

    // adjust each of the secondary panes to accomodate for the new container size
    let currentPaneSizes = this.state.paneSizes;
    for (let i = 0; i < currentPaneSizes.length; i++) {
      if (i !== this.props.primaryPaneIndex) {
        currentPaneSizes[i] = currentPaneSizes[i] + secondaryPaneSizeAdjustment;
      }
    }
    this.setState(({ paneSizes: currentPaneSizes }));
  }

  saveContainerRef(element: HTMLElement): void {
    this.containerRef = element;
  }

  saveSplitterRef(element: HTMLElement, index: number): void {
    if (!this.splitters[index]) {
      this.splitters[index] = {};
    }
    this.splitters[index]['ref'] = element;
  }

  savePaneRef(element: SplitterPane, index: number): void {
    if (!this.panes[index]) {
      this.panes[index] = {};
    }
    this.panes[index]['ref'] = ReactDom.findDOMNode(element);
  }

  onGrabSplitter(e, splitterIndex: number): void {
    clearSelection();
    // cache splitter dimensions
    this.splitters[splitterIndex]['dimensions'] = this.splitters[splitterIndex]['ref'].getBoundingClientRect();
    this.activeSplitter = splitterIndex;
    // cache container size
    this.containerSize = this.getContainerSize();
    this.setState(({ resizing: true }));
  }

  onMouseMove(e): void {
    if (this.state.resizing) {
      document.dispatchEvent(event);
      this.calculatePaneSizes(this.activeSplitter, e);
      clearSelection();
    }
  }

  calculatePaneSizes(splitterIndex: number, e): void {
    // get dimensions of both panes and the splitter
    const pane1Index = splitterIndex;
    const pane2Index = splitterIndex + 1;
    const pane1Dimensions = this.panes[pane1Index]['ref'].getBoundingClientRect();
    const pane2Dimensions = this.panes[pane2Index]['ref'].getBoundingClientRect();
    const splitterDimensions = this.splitters[splitterIndex]['dimensions'];

    // the primary pane's size will be the difference between the top (horizontal) or left (vertical) of the pane,
    // and the mouse's Y (horizontal) or X (vertical) position
    let primarySize = this.props.orientation === 'horizontal' ?
        this.panes[pane1Index]['size'] = Math.max((e.clientY - pane1Dimensions.top), this.props.minSizes[pane1Index] || MIN_PANE_SIZE)
      :
        this.panes[pane1Index]['size'] = Math.max((e.clientX - pane1Dimensions.left), this.props.minSizes[pane1Index] || MIN_PANE_SIZE);

    // the local container size will be the sum of the heights (horizontal) or widths (vertical) of both panes and the splitter
    const localContainerSize = this.props.orientation === 'horizontal' ?
        pane1Dimensions.height + pane2Dimensions.height + splitterDimensions.height
      :
        pane1Dimensions.width + pane2Dimensions.width + splitterDimensions.width;

    // bound the bottom (horizontal) or right (vertical) of the primary pane to the bottom or right of the container
    const splitterSize = this.props.orientation === 'horizontal' ? splitterDimensions.height : splitterDimensions.width;
    if ((primarySize + splitterSize) > localContainerSize) {
      primarySize = localContainerSize - splitterSize;
    }

    // the secondary pane's size will be the remaining height (horizontal) or width (vertical)
    // left in the container after subtracting the size of the splitter and primary pane from the total size
    const secondarySize = this.props.orientation === 'horizontal' ?
        this.panes[pane2Index]['size'] = Math.max((localContainerSize - primarySize - splitterDimensions.height), this.props.minSizes[pane2Index] || MIN_PANE_SIZE)
      :
        this.panes[pane2Index]['size'] = Math.max((localContainerSize - primarySize - splitterDimensions.width), this.props.minSizes[pane2Index] || MIN_PANE_SIZE);

    let currentPaneSizes = this.state.paneSizes;
    currentPaneSizes[pane1Index] = primarySize;
    currentPaneSizes[pane2Index] = secondarySize;
    if (this.props.onSizeChange) {
      const globalContainerSize = this.getContainerSize();
      const paneSizes = currentPaneSizes.map(size => ({ absolute: size, percentage: size / globalContainerSize * 100 }));
      this.props.onSizeChange(paneSizes);
    }
    this.setState(({ paneSizes: currentPaneSizes }));
  }

  onMouseUp(e): void {
    // stop resizing
    this.setState(({ resizing: false }));
  }

  render(): JSX.Element {
    // jam a splitter handle inbetween each pair of children
    const splitChildren = [];
    this.paneNum = this.splitNum = 0;

    this.props.children.forEach((child, index) => {
      // take a 'snapshot' of the current indices or else
      // the elements will all use the same value once they are rendered
      const paneIndex = this.paneNum;
      const splitIndex = this.splitNum;

      // add a pane
      if (!this.panes[paneIndex]) {
        this.panes[paneIndex] = {};
      }
      this.panes[paneIndex]['size'] = this.state.paneSizes[paneIndex] || DEFAULT_PANE_SIZE;
      const pane = <SplitterPane key={ `pane${paneIndex}` } orientation={ this.props.orientation }
              size={ this.state.paneSizes[paneIndex] } ref={ x => this.savePaneRef(x, paneIndex) }>{ child }</SplitterPane>;
      splitChildren.push(pane);

      // add a splitter if there is another child after this one
      if (this.props.children[index + 1]) {
        // record which panes this splitter controls
        if (!this.splitters[splitIndex]) {
          this.splitters[splitIndex] = {};
        }

        // add a splitter
        const splitter = (
          <div className={ this.SPLITTER_CSS } key={ `splitter${splitIndex}` }
            ref={ x => this.saveSplitterRef(x, splitIndex) }>
            <div onMouseDown={ (e) => this.onGrabSplitter(e, splitIndex) }/>
          </div>
        );
        splitChildren.push(splitter);
        this.splitNum++;
      }

      this.paneNum++;
    });

    return (
      <div ref={ this.saveContainerRef } className={ this.CONTAINER_CSS + ' split-container' }>
        <div className={ this.FLOATING_CANVAS_CSS }>
          { splitChildren }
        </div>
      </div>
    );
  }
}

/** Used to clear any text selected as a side effect of holding down the mouse and dragging */
function clearSelection(): void {
  const _document = document as any;
  if (window.getSelection) {
    if (window.getSelection().empty) {
      window.getSelection().empty();
    } else if (window.getSelection().removeAllRanges) {
      window.getSelection().removeAllRanges();
    }
  } else if (_document.selection) {
    _document.selection.empty();
  }
}