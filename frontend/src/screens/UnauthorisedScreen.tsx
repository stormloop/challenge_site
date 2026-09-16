import { useAuth0 } from "@auth0/auth0-react";
import styled, { useTheme } from "styled-components";
import Button from "../components/Button";

const StyledWrapper = styled.div`
background-color: ${props => props.theme.bg_color};
height: 100%;
display: flex;
flex-direction: column;
align-content: center;
padding-bottom: 25%;
justify-content: end;
    `;

export function LoginButton() {
    const { loginWithRedirect } = useAuth0();

    return (
        <Button text="Log in" icon={null} color={useTheme().accent_color_3} disabled={false} onClick={() => loginWithRedirect()} />
    );
}

export const UnauthorizedScreen: React.FC<{}> = () => {
    return (
        <StyledWrapper>
            {LoginButton()}
        </StyledWrapper>
    )
}

export default UnauthorizedScreen;