import React, { useState } from 'react'
import type { ComponentType, SVGProps } from "react";
import { styled } from 'styled-components';

export const NAVBAR_HEIGHT: number = 80;

const StyledWrapper = styled.div`
            .navbar {
                width: 100%;
                height: ${NAVBAR_HEIGHT}px;
                position: absolute;
                bottom: 0px;
                left: 0px;
                background-color: ${props => props.theme.bg_color};
                font-family: ${props => props.theme.text_font_family};
                box-shadow: 0px 0px 16px ${props => props.theme.bg_color};
            }

            .navbar_hr {
                width: 100%;
                height: 0px;
                position: absolute;
                bottom: ${NAVBAR_HEIGHT}px;
                left: -2px;
                margin: 0px;
                border-color: ${props => props.theme.text_color};
                color: ${props => props.theme.text_color};
                z-index: 10;
            }

            .navbar_tabs_container {
                height: 100%;
                display: flex; /* Creates a flexbox from this component. */
                flex-direction: row;
                gap: 5px;
            }

            .navbar button { /* Style for <button> elements inside a navbar */
                display: flex; /* Creates a flexbox from this component. */
                flex-direction: column;
                align-items: center;
                height: 100%;
                justify-content: center;
                flex: 1 1 0; /* Give each item the same width. */
                background-color: transparent;
                border: none;
                color: ${props => props.theme.text_color};  /* Sets child elements colors */
                padding: 0px 0px;
                text-align: center;
                text-decoration: none;
                font-weight: bold;
                font-size: 15px;
                cursor: pointer;
            }

            .navbar button svg {
                width: 36px;
                height: 36px;
            }`;


interface NavBarProps {
    tabs: string[]
    icons: ComponentType<SVGProps<SVGSVGElement>>[]

    currentTab: number
    setCurrentTab: React.Dispatch<React.SetStateAction<number>>
}

/**
 * A NavBar is used to navigate between multiple tabs of an application.
 * It is often found at an edge of the page.
 * This implementation allows the designer to define a set of tabs, each with icon and text.
 * The NavBar can then be implemented in the page by usign GetHtml()
 */
export const NavBar: React.FC<NavBarProps> = ({ tabs, icons, currentTab, setCurrentTab }) => {
    return (
        <StyledWrapper>
            <hr className="navbar_hr" />
            <div className="navbar">
                <div className="navbar_tabs_container">
                    {tabs.length <= 0 ? (<></>) : tabs.map((_, index) => {
                        const Icon = icons[index];
                        return (
                            <button key={tabs[index] + " Tab"} onClick={() => setCurrentTab(index)}>
                                <Icon />
                                <span>{tabs[index]}</span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </StyledWrapper>)
}

export default NavBar;
