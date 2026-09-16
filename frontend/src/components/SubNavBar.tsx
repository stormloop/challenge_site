import React, { useState } from 'react'
import type { ComponentType } from "react";
import { styled } from 'styled-components';

export const SUBNAVBAR_HEIGHT: number = 35 + 10; // Actual height + gap from navbar.

const StyledWrapper = styled.div`
// Sub navbar
width: fit-content;
display: flex;
flex-direction: row;
// gap: 16px;
background-color: ${props => props.theme.leaderboard_color_1};
border-radius: 100px;
box-sizing: border-box;

position: absolute;
left: 50%;
bottom: 10px;
transform: translate(-50%, 0);

z-index: 10;

.tab {
    font-family: ${props => props.theme.text_font_family};
    color: ${props => props.theme.text_color};
    background-color: transparent;
    cursor: pointer;
    padding: 8px 32px;
    text-align: center;
}

.first {
    border-color: transparent;
    border-radius: 100px 0 0 100px;
}

.middle {
    border-left: ${props => props.theme.bg_color} solid 1px;
    border-right: transparent;
    border-top: transparent;
    border-bottom: transparent;
}

.last {
    border-left: ${props => props.theme.bg_color} solid 1px;
    border-right: transparent;
    border-top: transparent;
    border-bottom: transparent;
    border-radius: 0 100px 100px 0;
}

.highlighted {
    background-color: ${props => props.theme.leaderboard_color_2};
}
    `;


interface SubNavBarProps {
    tabs: string[]

    currentTab: number
    setCurrentTab: React.Dispatch<React.SetStateAction<number>>
}

/**
 * A NavBar is used to navigate between multiple tabs of an application.
 * It is often found at an edge of the page.
 * This implementation allows the designer to define a set of tabs, each with icon and text.
 * The NavBar can then be implemented in the page by usign GetHtml()
 */
export const SubNavBar: React.FC<SubNavBarProps> = ({ tabs, currentTab, setCurrentTab }) => {
    return (
        <StyledWrapper>
            {tabs.length <= 0 ? (<></>) : tabs.map((_, index) => {
                return (
                    <button key={tabs[index] + " Tab"} onClick={() => setCurrentTab(index)} className={"tab " + (index == 0 ? "first" : index == tabs.length - 1 ? "last" : "middle") + (currentTab == index ? " highlighted" : "")}>
                        {tabs[index]}
                    </button>
                )
            })}
        </StyledWrapper>)
}

export default SubNavBar;
