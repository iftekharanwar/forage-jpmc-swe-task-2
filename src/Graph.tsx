import React, { Component } from 'react';
import { Table } from '@finos/perspective';
import { ServerRespond } from './DataStreamer';
import './Graph.css';

/**
 * Props declaration for <Graph />
 */
interface IProps {
  data: ServerRespond[],
}

/**
 * Perspective library adds load to HTMLElement prototype.
 * This interface acts as a wrapper for Typescript compiler.
 */
interface PerspectiveViewerElement extends HTMLElement {
  load: (table: Table) => void,
  setAttribute: (name: string, value: string) => void,
}

/**
 * React component that renders Perspective based on data
 * parsed from its parent through data property.
 */
class Graph extends Component<IProps, {}> {
  // Perspective table
  table: Table | undefined;

  render() {
    return React.createElement('perspective-viewer');
  }

  componentDidMount() {
    // Get element to attach the table from the DOM.
    const elem: PerspectiveViewerElement = document.getElementsByTagName('perspective-viewer')[0] as unknown as PerspectiveViewerElement;

    const schema = {
      stock: 'string',
      top_ask_price: 'float',
      top_bid_price: 'float',
      timestamp: 'date',
    };

    if (window.perspective && window.perspective.worker()) {
      this.table = window.perspective.worker().table(schema);
    }
    if (this.table) {
      // Load the `table` in the `<perspective-viewer>` DOM reference.
      elem.load(this.table);

      // Add more Perspective configurations here.
      elem.setAttribute('view', 'y_line');
      elem.setAttribute('column-pivots', '["stock"]');
      elem.setAttribute('row-pivots', '["timestamp"]');
      elem.setAttribute('columns', '["top_ask_price"]');
      elem.setAttribute('aggregates', JSON.stringify({
        stock: 'distinct count',
        top_ask_price: 'avg',
        top_bid_price: 'avg',
        timestamp: 'distinct count'
      }));
    }
  }

  async componentDidUpdate() {
    if (!this.table) {
      console.error('Perspective table is not initialized');
      return;
    }

    if (!Array.isArray(this.props.data)) {
      console.error('Invalid data format: expected an array');
      return;
    }

    try {
      // Get the existing data from the Perspective table
      const view = await this.table.view();
      if (!view) {
        throw new Error('Failed to create view from table');
      }
      const existingData = await view.to_json();

      // Filter out duplicates and only add new data
      const newData = this.props.data.filter((el: ServerRespond) => {
        return !existingData.some((existing: any) =>
          existing.stock === el.stock &&
          new Date(existing.timestamp).getTime() === new Date(el.timestamp).getTime()
        );
      });

      // Transform the data into the correct format for TableData
      const tableData: Record<string, (string | number | Date)[]> = {
        stock: [],
        top_ask_price: [],
        top_bid_price: [],
        timestamp: [],
      };

      // Populate tableData with improved error handling
      newData.forEach((el: ServerRespond) => {
        if (!el || typeof el.stock !== 'string') {
          console.warn('Invalid data element:', el);
          return;
        }

        tableData.stock.push(el.stock);

        const topAskPrice = el.top_ask && typeof el.top_ask.price === 'number' ? el.top_ask.price : 0;
        tableData.top_ask_price.push(topAskPrice);

        const topBidPrice = el.top_bid && typeof el.top_bid.price === 'number' ? el.top_bid.price : 0;
        tableData.top_bid_price.push(topBidPrice);

        const timestamp = new Date(el.timestamp);
        if (isNaN(timestamp.getTime())) {
          console.warn('Invalid timestamp:', el.timestamp);
          tableData.timestamp.push(new Date()); // Use current time as fallback
        } else {
          tableData.timestamp.push(timestamp);
        }
      });

      // Update the Perspective table with the correctly formatted data
      if (Object.values(tableData).some(arr => arr.length > 0)) {
        await this.table.update(tableData);
      } else {
        console.warn('No new data to update');
      }
    } catch (error) {
      console.error('Error updating Perspective table:', error);
    }
  }
}

export default Graph;
