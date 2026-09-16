import { useState, createContext } from 'react';
import styled from 'styled-components';

const StyledWrapper = styled.div`
border-radius: 16px;
box-sizing: border-box;
padding: 16px;
background-color: ${props => props.theme.bg_color_lightened};
box-shadow: 0px 4px 10px;
display: flex;
flex-direction: column;

width: 80%;
max-height: 95%;

position: absolute;
// left: 50%;
bottom: 50%;
transform: translate(0, 50%);

z-index: 100;

* {
    font-family: ${props => props.theme.text_font_family};
    color: ${props => props.theme.text_color};
}

hr {
    width: calc(100% + 32px - 2px); // Add padding, remove height.
    position: relative;
    transform: translate(-16px, 0);
}

.header {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
}

.header > * {
    font-weight: normal;
    font-size: 20px;
    margin-block-start: 0px;
    margin-block-end: 0px;
}

.close_button {
    border: none;
    background-color: ${props => props.theme.accent_color_5};
    border-radius: 100px;
    text-align: center;

    cursor: pointer;
    
    line-height: 32px;
    width: 32px;
    height: 32px;
}

`;

export interface PopupProps {
    header: string,
    getBody: Function,

    onAbort: Function,
}

/**
 * A Popup Window is used to prompt data from the user.
 * It is opened in the center of the currently open page, and makes everything else unresponsive.
 */
const PopupWindow: React.FC<PopupProps> = ({ header, getBody, onAbort }) => {
    return (
        <StyledWrapper>
            <div className="header">
                <h1>{header}</h1>
                <button className="close_button" onClick={() => onAbort()}>x</button>
            </div>
            <hr />
            {getBody()}
        </StyledWrapper>)
}


const OverlayWrapper = styled.div`

width: 100%;
height: 100%;
display: flex;
align-items: center;
justify-content: space-around;

.enabled {
    pointer-events: auto;
    z-index: 1000;
}

.enabled > * {
    z-index: 1001;
}
`;
export interface PopupContextProps {
    closePopup: (depth?: number) => void // Closes the currently open popup, or closes all popups up to and including the specified depth.
    openPopup: (popupProps: PopupProps) => number // Opens a new popup, returns the depth of the popup.
    refreshPopup: () => void // Refreshes the latest popup.
};

export const PopupContext = createContext<PopupContextProps>({
    closePopup: () => { },
    openPopup: (_: PopupProps) => 0,
    refreshPopup: () => { }
});

export const PopupProvider = ({ children }: any) => {
    const [popups, setPopups] = useState<PopupProps[]>([]);

    function closePopup(depth: number = -1) {
        setPopups(prev => {

            if (prev.length === 0)
                return prev;

            if (depth === -1)
                return prev.slice(0, -1);

            if (depth > prev.length)
                return prev;

            return prev.slice(0, depth - 1);
        });
    }

    function openPopup(popupProps: PopupProps) {
        const originalDepth = popups.length;
        setPopups([...popups, popupProps]);
        return originalDepth + 1;
    }

    function refreshPopup() {
        if (popups.length == 0)
            return;

        const popupsCopy: PopupProps[] = [...popups];
        const lastPopup = popupsCopy[popups.length - 1];
        const original_depth = popups.length;
        setPopups(popupsCopy.splice(original_depth - 1, 1));
        setPopups([...popupsCopy, lastPopup]);
    }

    return (
        <PopupContext.Provider value={{ closePopup, openPopup, refreshPopup }} >
            {children}
            {
                popups.map((popupProps, currentDepth) => (
                    <OverlayWrapper key={"popup " + currentDepth} className={currentDepth + 1 < popups.length ? "" : "enabled"}>
                        <PopupWindow {...popupProps} />
                    </OverlayWrapper>
                )
                )
            }
        </PopupContext.Provider>
    );
}