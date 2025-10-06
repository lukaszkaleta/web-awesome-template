import {html, LitElement} from 'lit';
import '@awesome.me/webawesome/dist/components/button/button.js';

export class ShowCase extends LitElement {

    render() {
        return html`<wa-button variant="neutral">Neutral</wa-button>
        <wa-button variant="brand">Brand</wa-button>
        <wa-button variant="success">Success</wa-button>
        <wa-button variant="warning">Warning</wa-button>
        <wa-button variant="danger">Danger</wa-button>`;
    }
}
customElements.define('lk-show-case', ShowCase);