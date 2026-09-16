import styled from "styled-components";

const StyledWrapper = styled.div`
color: ${props => props.theme.text_color};
font-family: ${props => props.theme.text_font_family};
background-color: ${props => props.theme.bg_color};
height: 100%;
display: flex;
flex-direction: column;
align-content: center;
padding-top: 25%;
justify-content: start;
text-align: center;
    `;

export const ErrorScreen: React.FC<{ error: string }> = ({ error }) => {
    return (
        <StyledWrapper>
            <h1>ERROR</h1>
            <p>{error}</p>
        </StyledWrapper>
    )
}

export default ErrorScreen;