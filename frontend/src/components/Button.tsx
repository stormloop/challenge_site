import type { ComponentType, SVGProps } from "react";
import { styled } from 'styled-components';


const StyledWrapper = styled.div<{ bg_color: string, disabled: boolean, disabled_color: string }>`
overflow: visible;

.styled_button {
    color: black;
    box-shadow: 0px 4px 10px;
    display: inline-block;
    border-radius: 50px;
}

.styled_button button {
    padding: 10px 16px;
    border-radius: 50px;
    border: none;
    cursor: pointer;
    font-family: ${props => props.theme.text_font_family};
    font-size: 16px;
    color: ${props => props.theme.text_color};
    background-color: ${({ bg_color, disabled, disabled_color }) => disabled ? disabled_color : bg_color};
    display: flex;
    flex-direction: row;
    gap: 8px;
}

.styled_button button svg {
    width: 16px;
    height: 16px;
}
    `;


interface ButtonProps {
    text: string | null
    icon: ComponentType<SVGProps<SVGSVGElement>> | null
    color: string

    onClick: Function
    disabled: boolean
}

export const Button: React.FC<ButtonProps> = ({ text, icon, color, onClick, disabled = false }) => {
    return (
        <StyledWrapper bg_color={color} disabled={disabled} disabled_color="#333333">
            <div className="styled_button">
                <button onClick={() => onClick()} disabled={disabled}>
                    {icon === null ? (<></>) : (() => {
                        const Icon = icon;
                        return (<Icon />);
                    })()}
                    {text === null ? (<></>) : text}
                </button>
            </div>
        </StyledWrapper>)
}

export default Button;
