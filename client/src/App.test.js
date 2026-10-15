import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import App from './App';

jest.mock('./Components/HomeExplore', () => () => <div>CineFlix home</div>);

test('renders the CineFlix home page', () => {
  const container = document.createElement('div');
  act(() => { ReactDOM.render(<App />, container); });
  expect(container.textContent).toBe('CineFlix home');
  ReactDOM.unmountComponentAtNode(container);
});
